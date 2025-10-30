import { Keypair } from '@solana/web3.js';
import { randomUUID } from 'crypto';
import { getDb, encryptDeterministic } from "../services/mongoService"
import {findSolanaToken} from "../integrations/tools/priceTools/utils";
export type ToolHandler = (args: any, keypair?: Keypair, user?: any) => any | Promise<any>;

function roundPrice(n: number, decimals = 8) {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

export const MISSIONS_TOOL_HANDLERS: Record<string, ToolHandler> = {
  GET_MISSIONS: async (args: {toDelete?:boolean}, keypair?: Keypair,user?: any) => {
    const db = await getDb();
    const doc = await db.collection<UserDoc>('users_missions')
        .findOne({ id: await encryptDeterministic(user.id) }, { projection: { _id: 0, tasks: 1 } });

    const tasks: UserTask[] = doc?.tasks ?? [];

    if(args.toDelete){
        await db.collection<UserDoc>('users_missions').updateOne(
            { id: await encryptDeterministic(user.id) },
            { $pull: { tasks: { status: { $in: ['done', 'failed'] } } } }
        );
    }
    return {resForAi: {missions: tasks}, resForStatus:{missions: tasks}}
  },
  CREATE_MISSION: async (args: {type:string, condition:string, typePayload:any, conditionPayload:any}, keypair?: Keypair,user?: any) => {
    if(!args.type || !args.condition) return {resForAi: {error: `There is not enough info missing type of mission or condition`}};
    const now = new Date();
    const task:UserTask  = {
        taskId: randomUUID(),
        type: args.type,
        payload: {},
    
        status: 'pending',
        scheduledAt: now,
    
        checks: 0,
        attempts: 0,
        maxAttempts:  5,
        backoffSec:  120,
        checkIntervalSec: 5 * 60,
        priority: 0,
    
        condition: args.condition,
        conditionPayload: {},
    
        maxWaitUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    
        createdAt: now,
        updatedAt: now,
    }

   switch (args.condition) {
    case "PRICE_LOW": {
        const token = args.conditionPayload?.token;
        const targetPrice = args.conditionPayload?.targetPrice;
        const percent = args.conditionPayload?.percent ?? args.conditionPayload?.percentage ?? args.conditionPayload?.pct;

        if (!token) return { resForAi: { error: 'There is not enough info: missing tokenAddress' } };

        if (typeof targetPrice === 'number') {
        task.conditionPayload = { token, targetPrice: Number(targetPrice) };
        } else if (typeof percent === 'number') {
        const nowPrice = (await findSolanaToken(token, true)).priceUsd;
        if (!nowPrice || !isFinite(nowPrice)) {
            return { resForAi: { error: `Failed to fetch current price for ${token}` } };
        }
        const final = roundPrice(nowPrice * (1 - Math.abs(percent) / 100));
        task.conditionPayload = {
            token,
            targetPrice: final,
            mode: 'PERCENT_OF_CURRENT',
            percent: Math.abs(percent),
            basePrice: nowPrice,
            computedAt: new Date().toISOString(),
        };
        } else {
        return { resForAi: { error: 'There is not enough info: provide targetPrice or percent' } };
        }
        break;
    }

    case "PRICE_HIGH": {
        const token = args.conditionPayload?.token;
        const targetPrice = args.conditionPayload?.targetPrice;
        const percent = args.conditionPayload?.percent ?? args.conditionPayload?.percentage ?? args.conditionPayload?.pct;

        if (!token) return { resForAi: { error: 'There is not enough info: missing tokenAddress' } };

        if (typeof targetPrice === 'number') {
        task.conditionPayload = { token, targetPrice: Number(targetPrice) };
        } else if (typeof percent === 'number') {
        const nowPrice = (await findSolanaToken(token, true)).priceUsd;
        if (!nowPrice || !isFinite(nowPrice)) {
            return { resForAi: { error: `Failed to fetch current price for ${token}` } };
        }
        const final = roundPrice(nowPrice * (1 + Math.abs(percent) / 100));
        task.conditionPayload = {
            token,
            targetPrice: final,
            mode: 'PERCENT_OF_CURRENT',
            percent: Math.abs(percent),
            basePrice: nowPrice,
            computedAt: new Date().toISOString(),
        };
        } else {
        return { resForAi: { error: 'There is not enough info: provide targetPrice or percent' } };
        }
        break;
    }

    case "MARKETCAP_LOW": {
        const token = args.conditionPayload?.token;
        const targetCap = args.conditionPayload?.targetCap;
        const percent = args.conditionPayload?.percent;

        if (!token) return { resForAi: { error: 'Missing token for market cap condition' } };

        if (typeof targetCap === 'number') {
            task.conditionPayload = { token, targetCap };
        } else if (typeof percent === 'number') {
            const info = await findSolanaToken(token, true);
            if (!info?.marketCap) return { resForAi: { error: `Failed to fetch market cap for ${token}` } };
            const final = Math.round(info.marketCap * (1 - Math.abs(percent) / 100));
            task.conditionPayload = {
            token,
            targetCap: final,
            mode: 'PERCENT_OF_CURRENT',
            percent: Math.abs(percent),
            baseCap: info.marketCap,
            computedAt: new Date().toISOString(),
            };
        } else {
            return { resForAi: { error: 'Provide targetCap or percent' } };
        }
        break;
        }

        case "MARKETCAP_HIGH": {
        const token = args.conditionPayload?.token;
        const targetCap = args.conditionPayload?.targetCap;
        const percent = args.conditionPayload?.percent;

        if (!token) return { resForAi: { error: 'Missing token for market cap condition' } };

        if (typeof targetCap === 'number') {
            task.conditionPayload = { token, targetCap };
        } else if (typeof percent === 'number') {
            const info = await findSolanaToken(token, true);
            if (!info?.marketCap) return { resForAi: { error: `Failed to fetch market cap for ${token}` } };
            const final = Math.round(info.marketCap * (1 + Math.abs(percent) / 100));
            task.conditionPayload = {
            token,
            targetCap: final,
            mode: 'PERCENT_OF_CURRENT',
            percent: Math.abs(percent),
            baseCap: info.marketCap,
            computedAt: new Date().toISOString(),
            };
        } else {
            return { resForAi: { error: 'Provide targetCap or percent' } };
        }
        break;
        }

    default:
        return { resForAi: { error: `There is no such condition as ${args.condition}` } };
    }

    switch (args.type){
        case "SWAP":{
            if(!args.typePayload.buyOrSell || !args.typePayload.amount || !args.typePayload.token) return {resForAi: {error: `There is not enough info missing buyOrSell or amount or tokenAddress`}};
            task.payload.buyOrSell = args.typePayload.buyOrSell;
            task.payload.amount = args.typePayload.amount;
            task.payload.token = args.typePayload.token;
            break;
        }
        default: {
            return {resForAi: {error: `There is no such type of mission as ${args.type}`}}
        }
    }

    const db = await getDb();
    const res = await db.collection<UserDoc>('users_missions').updateOne(
        {
        id: await encryptDeterministic(user.id),
        $expr: {
            $lte: [
            {
                $size: {
                $filter: {
                    input: '$tasks',
                    as: 't',
                    cond: { $in: ['$$t.status', ['pending', 'leased']] },
                },
                },
            },
            4,
            ],
        },
        },
        {
        $push: { tasks: task },
        },
        { upsert: false }
    );

    if (res.modifiedCount !== 1) {
        throw new Error('Limit reached: у пользователя уже 5 задач в обработке или ожидании.');
    }

    return {resForAi: { mission: task}};
  },
  DELETE_MISSION: async (args: {taskId: string}, keypair?: Keypair,user?: any) => {
    const db = await getDb();

    const res = await db.collection<UserDoc>('users_missions').updateOne(
        { id: await encryptDeterministic(user.id) },
        { $pull: { tasks: { taskId: args.taskId } } }
    );

    return {resForAi: { affectedTasks: res.modifiedCount > 0}};
  }
}