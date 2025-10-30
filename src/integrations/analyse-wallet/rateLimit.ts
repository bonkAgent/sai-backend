import {pid} from "./security";

const TTL_SECONDS = 1200;

function keyUserOrAddr(idOrAddr: string) {
    return `rl:user:${pid(idOrAddr)}:global`;
}

export async function acquireUserCooldown(redis: any, idOrAddr?: string) {
    if (!idOrAddr) {
        return { ok: false as const, ttl: TTL_SECONDS };
    }
    const key = keyUserOrAddr(idOrAddr);
    const res = await redis.set(key, "1", "EX", TTL_SECONDS, "NX");
    const granted = res === "OK" || res === 1 || res === true;
    if (granted) {
        return { ok: true as const, ttl: TTL_SECONDS };
    }
    const ttl = await redis.ttl(key);
    return { ok: false as const, ttl: Math.max(0, Number(ttl ?? 0)) };
}

export async function resetUserCooldown(redis: any, idOrAddr?: string) {
    if (!idOrAddr) return;
    const key = keyUserOrAddr(idOrAddr);
    await redis.del(key);
}