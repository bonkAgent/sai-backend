import { randomUUID } from 'crypto';
import { getKaelusPrivateKey, getPrivyUserById } from "../services/privyService";
import { addActivity, getDb, getBalances } from "../services/mongoService";
import {findSolanaToken, findTokenInBalance, toUsd} from "../integrations/tools/priceTools/utils";
import {TOOL_HANDLERS} from "../promtsAI/tool-handlers";

const CONCURRENCY = 8;
const BATCH_SIZE = 5;
const LEASE_SEC = 180;
const CHECK_INTERVAL_SEC = 1 * 60;
const WORKERid = `worker-${randomUUID()}`;

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { active--; if (queue.length) queue.shift()!(); };
  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then((v) => { next(); resolve(v); })
           .catch((e) => { next(); reject(e); });
      };
      active < concurrency ? run() : queue.push(run);
    });
}

const limit = createLimiter(CONCURRENCY);


async function claimOne(db: any): Promise<{ userId: string; task: UserTask } | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_SEC * 1000);

  const [candidate] = await db.collection('users_missions').aggregate([
    { $match: { 'tasks.status': 'pending', 'tasks.scheduledAt': { $lte: now } } },
    { $unwind: '$tasks' },
    { $match: { 'tasks.status': 'pending', 'tasks.scheduledAt': { $lte: now } } },
    { $sort: { 'tasks.priority': -1, 'tasks.scheduledAt': 1, id: 1 } },
    { $limit: 1 },
    { $project: { userId: '$id', task: '$tasks' } },
  ]).toArray();

  if (!candidate) return null;
  const { userId, task } = candidate as { userId: string; task: UserTask };

  const res = await db.collection('users_missions').updateOne(
    {
      id: userId,
      'tasks.taskId': task.taskId,
      'tasks.status': 'pending',
      'tasks.scheduledAt': { $lte: now },
    },
    {
      $set: {
        'tasks.$[t].status': 'leased',
        'tasks.$[t].workerId': WORKERid,
        'tasks.$[t].leaseUntil': leaseUntil,
        'tasks.$[t].updatedAt': now,
      },
    },
    { arrayFilters: [{ 't.taskId': task.taskId, 't.status': 'pending', 't.scheduledAt': { $lte: now } }] }
  );

  if (res.modifiedCount !== 1) return null;
  return {
    userId,
    task: {
      ...task,
      status: 'leased',
      workerId: WORKERid,
      leaseUntil,
      updatedAt: now,
    },
  };
}

async function claimBatch(db: any) {
  const claimed: Array<{ userId: string; task: UserTask }> = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const one = await claimOne(db);
    if (!one) break;
    claimed.push(one);
  }
  console.log(claimed)
  return claimed;
}


async function evaluateCondition(db: any, userId: string, task: UserTask): Promise<boolean> {
  const c = task.condition;
  const payload: any = task.conditionPayload;
  if (!c) return true;

  if (!payload || !payload.token) return false;

  let info: any;
  try {
    const balance = (await getBalances(await getPrivyUserById(userId)));
    payload.token = (findTokenInBalance(balance, payload.token))[0].address
    info = await findSolanaToken(payload.token, true);
  } catch (e) {
    console.error('findSolanaToken failed:', e);
    return false;
  }
  if (!info) return false;

  const currentPrice = Number(info.priceUsd);
  const currentCap = Number(info.marketCap);

  const hasPrice = Number.isFinite(currentPrice);
  const hasCap = Number.isFinite(currentCap);

  switch (c) {
    case 'PRICE_LOW': {
      if (!hasPrice || !Number.isFinite(Number(payload.targetPrice))) return false;
      const target = Number(payload.targetPrice);
      if (currentPrice <= target) {
        return true;
      }
      return false;
    }

    case 'PRICE_HIGH': {
      if (!hasPrice || !Number.isFinite(Number(payload.targetPrice))) return false;
      const target = Number(payload.targetPrice);
      if (currentPrice >= target) {
        return true;
      }
      return false;
    }

    case 'MARKETCAP_LOW': {
      if (!hasCap || !Number.isFinite(Number(payload.targetCap))) return false;
      const target = Number(payload.targetCap);
      if (currentCap <= target) {
        return true;
      }
      return false;
    }

    case 'MARKETCAP_HIGH': {
      if (!hasCap || !Number.isFinite(Number(payload.targetCap))) return false;
      const target = Number(payload.targetCap);
      if (currentCap >= target) {
        return true;
      }
      return false;
    }

    default:
      return false;
  }
}


async function processTask(db: any, userId: string, task: UserTask) {
  const now = new Date();
  const ok = await evaluateCondition(db, userId, task);

  if (!ok) {
    const waitSec = task.checkIntervalSec ?? CHECK_INTERVAL_SEC;
    await db.collection('users_missions').updateOne(
      { id: userId },
      {
        $set: {
          'tasks.$[t].status': 'pending',
          'tasks.$[t].scheduledAt': new Date(Date.now() + waitSec * 1000),
          'tasks.$[t].updatedAt': new Date(),
        },
        $unset: { 'tasks.$[t].leaseUntil': '', 'tasks.$[t].workerId': '' },
        $inc: { 'tasks.$[t].checks': 1 },
      },
      { arrayFilters: [{ 't.taskId': task.taskId, 't.workerId': WORKERid }] }
    );

    if (task.maxWaitUntil && now > new Date(task.maxWaitUntil)) {
      await db.collection('users_missions').updateOne(
        { id: userId },
        {
          $set: {
            'tasks.$[t].status': 'failed',
            'tasks.$[t].updatedAt': now,
          },
          $unset: { 'tasks.$[t].leaseUntil': '', 'tasks.$[t].workerId': '' },
        },
        { arrayFilters: [{ 't.taskId': task.taskId }] }
      );
    }
    return;
  }

  try {
    const privyUser = await getPrivyUserById(userId);
    const privateKey = await getKaelusPrivateKey(privyUser);
    let entry:any ={};
    const payload = task.payload;
    switch (task.type) {
      case 'SWAP':{
        const resStatus = (await TOOL_HANDLERS.SWAP({
          from: payload.buyOrSell === "BUY"? 'So11111111111111111111111111111111111111112': payload.token,
          to: payload.buyOrSell === "BUY"? payload.token: 'So11111111111111111111111111111111111111112',
          amount: payload.amount,
          priorityFee: 10000
        }, privateKey, privyUser)).resForStatus;

        if(!resStatus) throw new Error("Not enough money")
        entry.key = "SWAP"
        entry.status = "success"
        entry.amount = resStatus?.amountFrom ?? null;
        entry.token  = { symbol: resStatus?.from?.symbol ?? null, address: resStatus?.from?.address };
        entry.txid   = resStatus?.id ?? null;
        entry.meta   = { toToken: resStatus?.to, amountTo: resStatus?.amountTo };
        entry.usdAmount = await toUsd(entry.amount, resStatus?.from?.address);
        break;}
      case 'ADD_LIQUDITY':
        break;
      case 'REMOVE_LIQUDITY':
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    await addActivity(privyUser, entry)
    await db.collection('users_missions').updateOne(
      { id: userId },
      {
        $set: {
          'tasks.$[t].status': 'done',
          'tasks.$[t].updatedAt': new Date(),
        },
        $unset: { 'tasks.$[t].leaseUntil': '', 'tasks.$[t].workerId': '' },
        $inc: { 'tasks.$[t].attempts': 1 },
      },
      { arrayFilters: [{ 't.taskId': task.taskId, 't.workerId': WORKERid }] }
    );
  } catch (err) {
    console.log(err)
    const attempts = (task.attempts ?? 0) + 1;
    const maxAttempts = task.maxAttempts ?? 5;
    const base = task.backoffSec ?? 120;
    const delaySec = base;

    if (attempts < maxAttempts) {
      await db.collection('users_missions').updateOne(
        { id: userId },
        {
          $set: {
            'tasks.$[t].status': 'pending',
            'tasks.$[t].scheduledAt': new Date(Date.now() + delaySec * 1000),
            'tasks.$[t].updatedAt': new Date(),
          },
          $unset: { 'tasks.$[t].leaseUntil': '', 'tasks.$[t].workerId': '' },
          $inc: { 'tasks.$[t].attempts': 1 },
        },
        { arrayFilters: [{ 't.taskId': task.taskId, 't.workerId': WORKERid }] }
      );
    } else {
      await db.collection('users_missions').updateOne(
        { id: userId },
        {
          $set: { 'tasks.$[t].status': 'failed', 'tasks.$[t].updatedAt': new Date() },
          $unset: { 'tasks.$[t].leaseUntil': '', 'tasks.$[t].workerId': '' },
          $inc: { 'tasks.$[t].attempts': 1 },
        },
        { arrayFilters: [{ 't.taskId': task.taskId, 't.workerId': WORKERid }] }
      );
    }
  }  
}


async function drainOnce(db: any) {
  const batch = await claimBatch(db);
  await Promise.all(batch.map(({ userId, task }) => limit(() => processTask(db, userId, task))));
}

export async function mainLoop() {
  const db = await getDb();

  const changeStream = db.collection('users_missions').watch([
    { $match: { operationType: { $in: ['insert', 'update', 'replace'] } } },
  ]);

  (async () => {
    for await (const _ of changeStream as any) {
      void drainOnce(db);
    }
  })().catch(() => { /* noop */ });

  setInterval(() => void drainOnce(db), 1 * 60  * 1000);

  setInterval(async () => {
    const now = new Date();
    await db.collection('users_missions').updateMany(
      {},
      {
        $set: {
          'tasks.$[t].status': 'pending',
          'tasks.$[t].updatedAt': now,
        },
        $unset: { 'tasks.$[t].leaseUntil': '', 'tasks.$[t].workerId': '' },
      },
      { arrayFilters: [{ 't.status': 'leased', 't.leaseUntil': { $lte: now } }] }
    );
  }, 60 * 1000);

  await drainOnce(db);
}