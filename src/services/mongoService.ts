import { User } from '@privy-io/server-auth';
import CryptoJS from 'crypto-js'; // больше не используется
import { Collection, MongoClient, ServerApiVersion } from "mongodb";
import crypto from "node:crypto";

const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** Делаем стабильный 64-байтовый ключ для AES-SIV-256 (если в env не 64 байта) */
function deriveSivKey(): Uint8Array {
  const secret = Buffer.from(process.env.ENCRYPTION_SECRET!, "hex");
  // HKDF → 64 bytes (RFC5869)
  const key = crypto.hkdfSync("sha256", secret, Buffer.alloc(0), Buffer.from("aes-siv"), 64);
  return new Uint8Array(key);
}
const SIV_KEY = deriveSivKey();

/** Кэш классов из ESM, чтобы импортировать один раз */
let _SIVCtor: any;
let _AESCtor: any;

async function ensureSivModules() {
  if (_SIVCtor && _AESCtor) return;
  // ⚠️ eval-import: предотвращает даунлевел в require()
  const mSiv = await (0, eval)('import("@stablelib/siv")');
  const mAes = await (0, eval)('import("@stablelib/aes")');
  _SIVCtor = mSiv.SIV;
  _AESCtor = mAes.AES;
}

function makeSivInstance() {
  return new _SIVCtor(_AESCtor, SIV_KEY);
}

/** Детерминированное шифрование (AES-SIV). AAD можно передавать массивом строк */
export async function encryptDeterministic(plaintextStr: string, aadParts: string[] = []): Promise<string> {
  await ensureSivModules();
  const siv = makeSivInstance();
  const aad = aadParts.map((s) => ENC.encode(s));
  const ct = siv.seal(aad, ENC.encode(plaintextStr)); // Uint8Array
  return Buffer.from(ct).toString("base64");
}

export async function decryptDeterministic(b64: string, aadParts: string[] = []): Promise<string> {
  await ensureSivModules();
  const siv = makeSivInstance();
  const aad = aadParts.map((s) => ENC.encode(s));
  const pt = siv.open(aad, Buffer.from(b64, "base64")); // Uint8Array | null
  if (!pt) throw new Error("SIV auth failed");
  return DEC.decode(pt);
}

let connected = false;
const client = new MongoClient(process.env.MONGO_URL!, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET!; // можно оставить, хотя теперь не используется напрямую

type ActivityAction = {
    createdAt: string;
    tool: string;
    success: boolean;
    amount?: number | null;
    token?: { symbol?: string | null; address: string; decimals?: number | null };
    usdAmount?: number | null;
    txid?: string | null;
    meta?: any;
};

type ActivityDoc = {
    id: string;
    actions: ActivityAction[];
};

async function connectCollection(collectionName: string): Promise<Collection> {
    if (!connected) {
        try {
            await client.connect();
            connected = true;
        } catch (err) {
            console.error("MongoDB connection failed:", err);
            throw err;
        }
    }
    const db = client.db();
    const collection = db.collection(collectionName);
    return collection;
}

export async function getDb() {
    if (!connected) {
        try {
            await client.connect();
            connected = true;
        } catch (err) {
            console.error("MongoDB connection failed:", err);
            throw err;
        }
    }
    return client.db();
}

export async function createUser(userId: string) {
    console.log(userId)
    const encryptedId = await encryptDeterministic(userId);
    const friendCollection = await connectCollection("users_friends");
    const statusCollection = await connectCollection("users_status");
    const activityCollection = await connectCollection("users_activity");
    const missionCollection = await connectCollection("users_missions");

    await missionCollection.insertOne({
        id: encryptedId,
        tasks: []
    });
    await activityCollection.insertOne({
        id: encryptedId
    });
    await friendCollection.insertOne({
        id: encryptedId,
        friends: []
    });
    await statusCollection.insertOne({
        id: encryptedId,
        balances: [{
            symbol:"SOL",
            address:"So11111111111111111111111111111111111111112",
            name:"Solana",
            logoURI:"https://res.coinpaper.com/coinpaper/solana_sol_logo_32f9962968.png",
            balance:0,
            decimals: 9
        }],
        positions: []
    });

    return "success";
}

export async function setFriend(user: User, name: string, walletAddress: string): Promise<string> {
    const encryptedId = await encryptDeterministic(user.id);
    const friendsCollection = await connectCollection("users_friends");

    const newFriend = { name, walletAddress };

    const existingUser = await friendsCollection.findOne({  id: encryptedId });

    if (!existingUser) {
        return "User not found";
    }

    const friends = existingUser.friends || [];

    if (friends.length >= 5) {
        return "You can only have up to 5 friends";
    }

    const nameExists = friends.some((friend:any) => friend.name === name);
    if (nameExists) {
        return "There is a friend with such name";
    }

    friends.push(newFriend);

    await friendsCollection.updateOne(
        { 
            id: encryptedId },
        {
        $set: {
            friends: friends
        }
        }
    );

    return "success";
}

export async function getFriends(user: User){
    const encryptedId = await encryptDeterministic(user.id);
    const friendsCollection = await connectCollection("users_friends");
    const existingUser = await friendsCollection.findOne({  id: encryptedId });
    if (!existingUser) {
        return "User not found";
    }

    const friends = existingUser.friends;

    if(friends){
        return friends;
    }
    return [{name: "You have no friends yet", address:""}];
}

export async function deleteFriend(user: User, name: string) {
    const encryptedId = await encryptDeterministic(user.id);
    const friendsCollection = await connectCollection("users_friends");

    const existingUser = await friendsCollection.findOne({ id: encryptedId });
    
    if (!existingUser) {
        return "User not found";
    }

    const friends = existingUser.friends;
    if (!friends) {
        return [{name:"You have no friends yet", walletAddress: " "}];
    }

    const friendExists = friends.some((friend: any) => friend.name === name);
    if (!friendExists) {
        return "There is no friend with scuh name";
    }

    const updatedFriends = friends.filter((friend: any) => friend.name !== name);

    await friendsCollection.updateOne(
        { 
            id: encryptedId },
        {
        $set: {
            friends: updatedFriends
        }
        }
    );

    return "success";
}

export async function getToolStatus(user: User) {
    const encryptedId = await encryptDeterministic(user.id);
    const statusCollection = await connectCollection("users_status");
    const existingUser = await statusCollection.findOne({  id: encryptedId });
    if (!existingUser) {
        return "User not found";
    }

    const toolStatus = existingUser.tool_status;

    if(toolStatus){
        return toolStatus;
    }

    return {toolName: "no tool"};
}

export async function setToolStatus(user: User, tool_name: string, aitext: string, tool_res: Object) {
    const encryptedId = await encryptDeterministic(user.id);
    const statusCollection = await connectCollection("users_status");
    const existingUser = await statusCollection.findOne({  id: encryptedId });
    if (!existingUser) {
        throw new Error("User not found");
    }
    const now = new Date();
    const time = `${now.getSeconds()}${now.getMilliseconds()}`
    let needToBalance = existingUser.tool_status?.needToBalance
    if(tool_name === "SWAP" || tool_name === "TRANSFER_TOKENS" ||tool_name === "STAKE" || tool_name === "UNSTAKE" || tool_name === "CREATE_TOKEN"
        || tool_name === "ADD_METEORA_LIQUIDITY" || tool_name === "REMOVE_METEORA_LIQUIDITY" || tool_name === "REBAlANCE_METEORA_LIQUIDITY" || tool_name === "CLOSE_METEORA_POSITION" || tool_name === "CLAIM_METEORA_REWARD"
    ){
        needToBalance = 2;
    }
    const tool_status = {tool_name, time, aitext, tool_res, needToBalance}
    await statusCollection.updateOne(
        { 
            id: encryptedId },
        {
        $set: {
            tool_status
        }
        }
    );
}

export async function getBalances(user: User) {
    const encryptedId = await encryptDeterministic(user.id);
    const statusCollection = await connectCollection("users_status");
    const existingUser = await statusCollection.findOne({ id: encryptedId });
    if (!existingUser) return "User not found";
    return existingUser.balances ?? null;
}

export async function setBalance(user: User, balances: any) {
    const encryptedId = await encryptDeterministic(user.id);
    const statusCollection = await connectCollection("users_status");
    const existingUser = await statusCollection.findOne({ id: encryptedId });
    if (!existingUser) throw new Error("User not found");

    await statusCollection.updateOne(
        { id: encryptedId },
        { $set: { balances, balancesUpdatedAt: new Date().toISOString() } }
    );
}

export async function decrementNeedToBalance(user: User) {
    const encryptedId = await encryptDeterministic(user.id);
    const statusCollection = await connectCollection("users_status");
    const existingUser = await statusCollection.findOne({ id: encryptedId });
    if (!existingUser) throw new Error("User not found");

    const tool_status = existingUser.tool_status || {};
    const cur = typeof tool_status.needToBalance === 'number' ? tool_status.needToBalance : 0;
    tool_status.needToBalance = Math.max(0, cur - 1);

    await statusCollection.updateOne(
        { id: encryptedId },
        { $set: { tool_status } }
    );
}

export async function getMeteoraPositions(user: User) {
  const encryptedId = await encryptDeterministic(user.id);
  const statusCollection = await connectCollection("users_status");
  const existingUser = await statusCollection.findOne({ id: encryptedId });
  if (!existingUser) return "User not found";

  const positions = existingUser.positions;
  positions.forEach((pos: any) => {
    try {
      const bytes = CryptoJS.AES.decrypt(pos.secretKey, ENCRYPTION_SECRET);
      const plain = bytes.toString(CryptoJS.enc.Utf8);
      pos.secretKey = plain; // исходный приватный ключ (base58)
    } catch {
      pos.secretKey = "";
    }
  });

  return positions ?? null;
}

export async function setMeteoraPosition(
  user: User,
  positionParams: {
    secretKey: string, publicKey: string, poolName: string, poolAddress: string,
    maxBin: number, minBin: number, amountSol: number
  }
) {
  const encryptedId = await encryptDeterministic(user.id);
  // ⚠️ приватный ключ шифруем СТАРЫМ способом (CryptoJS AES)
  positionParams.secretKey = CryptoJS.AES.encrypt(positionParams.secretKey, ENCRYPTION_SECRET).toString();

  const statusCollection = await connectCollection("users_status");
  const existingUser = await statusCollection.findOne({ id: encryptedId });
  if (!existingUser) throw new Error("User not found");

  let positions = existingUser.positions;
  if (positions) {
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].publicKey === positionParams.publicKey) {
        positions[i] = positionParams;
        await statusCollection.updateOne({ id: encryptedId }, { $set: { positions } });
        return;
      }
    }
  }

  positions.push(positionParams);
  await statusCollection.updateOne({ id: encryptedId }, { $set: { positions } });
}

export async function deleteMeteoraPosition(user: User, publicKey:string) {
    const encryptedId = await encryptDeterministic(user.id);
    const statusCollection = await connectCollection("users_status");
    const existingUser = await statusCollection.findOne({ id: encryptedId });
    if (!existingUser) {
        throw new Error("User not found");
    }

    const positions = existingUser.positions;
    const friendExists = positions.some((pos: any) => pos.publicKey === publicKey);
    if (!friendExists) {
        return "There is no friend with scuh name";
    }

    const updatedPositions = positions.filter((pos: any) => pos.publicKey !== publicKey);

    await statusCollection.updateOne(
        { 
            id: encryptedId },
        {
        $set: {
            updatedPositions
        }
        }
    );
}

export async function addActivity(
    user: User,
    entry: {
        tool: string;
        success: boolean;
        amount?: number | null;
        token?: { symbol?: string | null; address: string; decimals?: number | null };
        usdAmount?: number | null;
        txid?: string | null;
        meta?: any;
        createdAt?: string;
    }
) {
    const encryptedId = await encryptDeterministic(user.id);
    const col = (await connectCollection("users_activity")) as unknown as Collection<ActivityDoc>;

    const action: ActivityAction = {
        createdAt: entry.createdAt ?? new Date().toISOString(),
        tool: entry.tool,
        success: entry.success,
        amount: entry.amount ?? null,
        token: entry.token,
        usdAmount: entry.usdAmount ?? null,
        txid: entry.txid ?? null,
        meta: entry.meta,
    };

    await col.updateOne(
        { id: encryptedId },
        {
            $setOnInsert: { id: encryptedId },
            $push: { actions: { $each: [action], $position: 0 } }
        },
        { upsert: true }
    );
}

export async function getActivity(
    user: User,
    {
        limit = 50,
        tools,
        success,
    }: { limit?: number; tools?: string[]; success?: boolean } = {}
) {
    const encryptedId = await encryptDeterministic(user.id);
    const col = (await connectCollection("users_activity")) as unknown as Collection<ActivityDoc>;

    const pipeline: any[] = [{ $match: { id: encryptedId } }, { $unwind: "$actions" }];

    const matchInner: any = {};
    if (Array.isArray(tools) && tools.length) matchInner["actions.tool"] = { $in: tools };
    if (typeof success === "boolean") matchInner["actions.success"] = success;
    if (Object.keys(matchInner).length) pipeline.push({ $match: matchInner });

    pipeline.push(
        { $sort: { "actions.createdAt": -1 } },
        { $limit: Math.max(1, Math.min(200, limit)) },
        { $replaceRoot: { newRoot: "$actions" } },
        { $project: { _id: 0 } }
    );

    const items = await col.aggregate<ActivityAction>(pipeline).toArray();
    return items;
}