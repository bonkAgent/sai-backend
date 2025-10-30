import { Keypair } from "@solana/web3.js";
import { User } from "@privy-io/server-auth";
import { analyzeWallet } from "./walletAnalyse";
import { StepModules } from "./sources/step";
import { redis } from "./redis";
import { acquireUserCooldown } from "./rateLimit";
import {pid} from "./security";

const TTL_SECONDS = 1200;

function selectUserWallet(user?: User | any): string | null {
    return (
        user?.walletAddress ||
        user?.solanaAddress ||
        user?.address ||
        user?.wallet?.address ||
        null
    );
}

function selectUserId(user?: User | any, fallbackAddr?: string | null): string | null {
    return user?.id || user?.userId || (fallbackAddr ? `addr:${fallbackAddr}` : null);
}


const keyUserLastByUser = (userId: string) => `ua:last:u:${pid(userId)}`;
const keyUserLastByAddr = (addr: string) => `ua:last:a:${pid(addr)}`;

function fmtEta(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m > 0) return `${m} min ${rem} sec`;
    return `${s} sec`;
}

function stringifyAi(x: unknown): string {
    if (x == null) return "";
    if (typeof x === "string") return x;
    try {
        return JSON.stringify(x);
    } catch {
        return String(x);
    }
}

function safeParseEnvelope(raw: any) {
    const t = raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw;
    if (raw == null) return null;
    if (typeof raw === "string") {
        try {
            const obj = JSON.parse(raw);
            return obj;
        } catch (e) {
            return null;
        }
    }
    if (typeof raw === "object") {
        return raw;
    }
    try {
        const obj = JSON.parse(String(raw));
        return obj;
    } catch (e) {
        return null;
    }
}

export async function ANALYZE_WALLET_TOOL(
    args: { address?: string; modules?: StepModules },
    _kp?: Keypair,
    user?: User
) {
    const requestedAddress = args?.address || selectUserWallet(user);
    const userId = selectUserId(user, requestedAddress);
    const cooldownKey = userId || requestedAddress ? (userId || `addr:${requestedAddress}`) : null;

    const cd = await acquireUserCooldown(redis, cooldownKey || undefined);

    if (!cd.ok) {
        const left = Math.max(0, cd.ttl);
        let lastRaw: any = null;
        const userKey = userId ? keyUserLastByUser(userId) : null;
        const addrKey = requestedAddress ? keyUserLastByAddr(requestedAddress) : null;

        if (userKey) {
            lastRaw = await redis.get(userKey);
        }

        if (!lastRaw && addrKey) {
            lastRaw = await redis.get(addrKey);
        }

        const last = safeParseEnvelope(lastRaw);

        if (last) {
            const savedAtStr = last.savedAt ? new Date(last.savedAt).toLocaleString() : "—";
            const header =
                `⏳ Rate limit active — showing cached snapshot\n\n` +
                `Requested: ${requestedAddress || "connected wallet"}\n` +
                `Shown (cached): ${last.ownerAddress || "—"}\n` +
                `Saved: ${savedAtStr}`;
            const tail = stringifyAi(last.resForAi);
            const out = {
                resForAi: `${header}\n\n${tail}`.trim(),
                resForStatus: {
                    rateLimited: true,
                    retryInSec: left,
                    lastSavedAt: last.savedAt || null,
                    ownerAddress: last.ownerAddress || null,
                    requestedAddress: requestedAddress || null,
                    ...(last.resForStatus ?? {})
                }
            };
            return out;
        }

        return {
            resForAi: "Rate limit active — no cached snapshot available",
            resForStatus: {
                rateLimited: true,
                retryInSec: left,
                lastSavedAt: null,
                ownerAddress: null,
                requestedAddress: requestedAddress || null
            }
        };
    }

    if (!user && !args?.address) {
        throw new Error("User or address is required");
    }

    if (!requestedAddress) {
        return { resForAi: "No wallet connected for this user." };
    }

    const modules: StepModules =
        args?.modules?.length
            ? args.modules
            : (["token", "liquidity", "farm", "stake", "dex", "lend", "vault"] as StepModules);


    const { resForAi, resForStatus } = await analyzeWallet(requestedAddress, modules);

    const envelope = {
        savedAt: Date.now(),
        ownerAddress: requestedAddress,
        resForAi,
        resForStatus
    };

    const writeKeys: string[] = [];
    if (userId) writeKeys.push(keyUserLastByUser(userId));
    writeKeys.push(keyUserLastByAddr(requestedAddress));

    for (const k of writeKeys) {
        try {
            await redis.set(k, JSON.stringify(envelope), "EX", TTL_SECONDS);
        } catch (e) {
        }
    }

    return {
        resForAi: stringifyAi(resForAi),
        resForStatus: {
            ownerAddress: requestedAddress,
            requestedAddress,
            ...(resForStatus ?? {})
        }
    };
}