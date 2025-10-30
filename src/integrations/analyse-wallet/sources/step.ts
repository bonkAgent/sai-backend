import fetch from "node-fetch";
import { redis } from "../redis";

export type StepModules = Array<"token"|"liquidity"|"farm"|"stake"|"lend"|"perp"|"nft"|"margin"|"vault"|"dex"|"domain"|"validator"|"nftmarket">;
type Json = Record<string, any>;

const STEP_BASE = (process.env.STEP_BASE || "https://api.step.finance/v1").trim();
const STEP_API_KEY = (process.env.STEP_API_KEY || "").trim();
const TTL_SECONDS = 1200;
const DEFAULT_NEED: StepModules = ["token","liquidity","farm","stake","dex","lend","vault"];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function isJson(ct: string | null) { return !!ct && ct.toLowerCase().includes("application/json"); }

async function fetchStepPortfolio(address: string, modules?: StepModules, timeoutMs = 20000): Promise<Json> {
    if (!STEP_API_KEY) throw new Error("STEP_API_KEY is required");
    const url = new URL(`${STEP_BASE}/portfolio/all/${address}`);
    if (modules?.length) url.searchParams.set("modules", modules.join(","));
    url.searchParams.set("maxWaitTime", "8");
    url.searchParams.set("staleTime", "60");
    url.searchParams.set("showSmallBalances", "true");
    url.searchParams.set("showcNFTs", "true");
    url.searchParams.set("apiKey", STEP_API_KEY);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const t0 = Date.now();
            const res = await fetch(url.toString(), {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${STEP_API_KEY}`,
                    "User-Agent": "KaelusBot/1.0",
                },
                signal: ctrl.signal,
            });
            const ct = res.headers.get("content-type");
            const bodyText = await res.text();
            if (res.status === 429 || res.status >= 500) {
                lastErr = new Error(`Step ${res.status}: ${bodyText.slice(0, 800)}`);
                await sleep(500 * attempt);
                continue;
            }
            if (!res.ok) {
                clearTimeout(timer);
                throw new Error(`Step ${res.status}: ${bodyText.slice(0, 1200)}`);
            }
            if (!isJson(ct)) {
                clearTimeout(timer);
                throw new Error(`Step 200 but non-JSON response (content-type=${ct || "n/a"}): ${bodyText.slice(0, 800)}`);
            }
            try {
                const json = JSON.parse(bodyText);
                clearTimeout(timer);
                return json as Json;
            } catch {
                clearTimeout(timer);
                throw new Error(`Step JSON parse error: ${bodyText.slice(0, 800)}`);
            }
        } catch (e) {
            lastErr = e;
            await sleep(300 * attempt);
        }
    }
    clearTimeout(timer);
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type CacheEnvelope = { modules: StepModules; data: Json; cachedAt: number; };

export async function stepGetPortfolioAllCached(address: string, _requested?: StepModules): Promise<Json> {
    const cacheKey = `wallet:${address}`;
    const cachedRaw = await redis.get(cacheKey);
    if (cachedRaw) {
        try {
            const cached: CacheEnvelope = JSON.parse(cachedRaw);
            return cached.data;
        } catch {}
    }
    const fresh = await fetchStepPortfolio(address, DEFAULT_NEED);
    const envelope: CacheEnvelope = { modules: DEFAULT_NEED, data: fresh, cachedAt: Date.now() };
    await redis.set(cacheKey, JSON.stringify(envelope), "EX", TTL_SECONDS);
    return fresh;
}

function pickAsset(asset: any) {
    const x = Array.isArray(asset) ? asset[0] : asset;
    return { title: x?.title, symbol: x?.symbol, mint: x?.mint, logoURI: x?.logoURI };
}

export type Spot = { mint: string; symbol?: string; name?: string; logoURI?: string; balance: number; priceInUSD: number; valueInUSD: number; priceChange24hPct?: number; };
export type YieldPosition = Spot & { apr?: number };

export function normalizeSpot(items: any[] = []): Spot[] {
    return items.map((p) => {
        const a = pickAsset(p.asset);
        return {
            mint: a.mint,
            symbol: a.symbol,
            name: a.title,
            logoURI: a.logoURI,
            balance: Number(p.balance ?? 0),
            priceInUSD: Number(p.priceInUSD ?? 0),
            valueInUSD: Number(p.valueInUSD ?? 0),
            priceChange24hPct: typeof p.priceChange24hPct === "number" ? p.priceChange24hPct : undefined,
        };
    }).filter((x) => Number.isFinite(x.valueInUSD));
}

export function normalizeYield(items: any[] = []): YieldPosition[] {
    const base = normalizeSpot(items);
    return base.map((x, i) => ({ ...x, apr: Number(items[i]?.apr ?? 0) || undefined }));
}

export function sumUsd(items: { valueInUSD?: number }[] = []) {
    return items.reduce((a, b) => a + (Number(b.valueInUSD) || 0), 0);
}

export function clampArray<T>(arr: T[] = [], max = 200) {
    return Array.isArray(arr) && arr.length > max ? arr.slice(0, max) : arr;
}