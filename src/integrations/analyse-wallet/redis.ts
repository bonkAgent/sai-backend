import { Redis as UpstashRedis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL || "";
const token = process.env.UPSTASH_REDIS_REST_TOKEN || "";

if (!url || !token) {
    throw new Error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
}

const upstash = new UpstashRedis({ url, token });

function parseLegacySetArgs(args: any[]): Record<string, any> | undefined {
    if (!args || !args.length) return undefined;
    if (typeof args[0] === "object" && args[0] !== null) return args[0];
    const opts: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (typeof a !== "string") continue;
        const A = a.toUpperCase();
        if (A === "EX") {
            const ttl = Number(args[i + 1]);
            if (Number.isFinite(ttl)) opts.ex = ttl;
            i++;
        } else if (A === "PX") {
            const ttl = Number(args[i + 1]);
            if (Number.isFinite(ttl)) opts.px = ttl;
            i++;
        } else if (A === "NX") {
            opts.nx = true;
        } else if (A === "XX") {
            opts.xx = true;
        }
    }
    return Object.keys(opts).length ? opts : undefined;
}

function mask(s: string, keep = 6) {
    if (!s) return s;
    if (s.length <= keep) return "*".repeat(s.length);
    return s.slice(0, keep) + "...";
}


export const redis = {
    async get(key: string): Promise<any> {
        const v = await upstash.get<any>(key);
        const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
        const preview =
            v === null ? null : t === "string" ? (v as string).slice(0, 80) : JSON.stringify(v).slice(0, 80);
        const len =
            v === null ? 0 : t === "string" ? (v as string).length : JSON.stringify(v).length;
        return v;
    },
    async set(key: string, value: any, ...args: any[]) {
        const isString = typeof value === "string";
        const payload = isString ? value : JSON.stringify(value);
        const options = parseLegacySetArgs(args);
        const res = options ? await upstash.set(key, payload, options as any) : await upstash.set(key, payload);
        return res;
    },
    async ttl(key: string): Promise<number> {
        const v = await upstash.ttl(key);
        const n = typeof v === "number" ? v : Number(v ?? 0);
        return n;
    },
    async del(key: string): Promise<number> {
        const v = await upstash.del(key);
        const n = typeof v === "number" ? v : Number(v ?? 0);
        return n;
    },
};