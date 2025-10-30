import { Client } from "@solana-tracker/data-api";
import type { Keypair } from "@solana/web3.js";
import type { User } from "@privy-io/server-auth";
import type { ToolHandler } from "../../promtsAI/tool-handlers";

if (!process.env.SOLANATRACKER_API_KEY) {
    throw new Error("SOLANATRACKER_API_KEY must be set in .env");
}

const stClient = new Client({ apiKey: process.env.SOLANATRACKER_API_KEY });

type TrendingMini = {
    mint: string;
    name: string;
    symbol: string;
    image?: string;
    change24h?: number;
    priceUsd?: number;
    marketCapUsd?: number;
};

function pickMint(t: any): string {
    return (
        t?.tokenAddress ??
        t?.address ??
        t?.mint ??
        t?.token?.address ??
        t?.token?.mint ??
        t?.pools?.[0]?.tokenAddress ??
        t?.pools?.[0]?.address ??
        ""
    );
}
function pickName(t: any): string {
    return t?.name ?? t?.token?.name ?? t?.pools?.[0]?.token?.name ?? "";
}
function pickSymbol(t: any): string {
    return t?.symbol ?? t?.token?.symbol ?? t?.pools?.[0]?.token?.symbol ?? "";
}
function pickImage(t: any): string | undefined {
    return t?.token?.image ?? t?.image ?? t?.pools?.[0]?.token?.image ?? undefined;
}
function pickChange24h(t: any): number | undefined {
    if (typeof t?.priceChange24hPct === "number") return t.priceChange24hPct * 100;
    if (typeof t?.priceChange24h === "number") return t.priceChange24h;
    const e24 = t?.events?.["24h"] ?? t?.events?._24h;
    if (e24?.priceChangePercentage != null) return Number(e24.priceChangePercentage);
    if (e24?.priceChangePct != null) return Number(e24.priceChangePct) * 100;
    if (typeof t?.change24h === "number") return t.change24h;
    return undefined;
}
function pickBestPool(t: any) {
    const pools: any[] = Array.isArray(t?.pools) ? t.pools : [];
    if (!pools.length) return undefined;
    return pools.reduce(
        (a, b) => ((b?.liquidity?.usd || 0) > (a?.liquidity?.usd || 0) ? b : a),
        pools[0]
    );
}
function pickPriceUsd(t: any): number | undefined {
    const p = pickBestPool(t);
    return typeof p?.price?.usd === "number" ? p.price.usd : undefined;
}
function pickMarketCapUsd(t: any): number | undefined {
    const p = pickBestPool(t);
    return typeof p?.marketCap?.usd === "number" ? p.marketCap.usd : undefined;
}

async function fetchTrendingMini(
    timeframe: "5m" | "15m" | "30m" | "1h" | "6h" | "12h" | "24h" = "1h",
    limit = 5
): Promise<TrendingMini[]> {
    const list = await stClient.getTrendingTokens(timeframe);
    const arr = Array.isArray(list) ? list : [];
    return arr.slice(0, limit).map((t) => ({
        mint: pickMint(t),
        name: pickName(t),
        symbol: pickSymbol(t),
        image: pickImage(t),
        change24h: pickChange24h(t),
        priceUsd: pickPriceUsd(t),
        marketCapUsd: pickMarketCapUsd(t),
    }));
}

const CACHE_TTL_MS = 60_000; // 60 s
let cache = {
    key: "" as string,
    asOf: 0,
    data: [] as TrendingMini[],
};

export async function getTrendingStatus(
    timeframe: "5m" | "15m" | "30m" | "1h" | "6h" | "12h" | "24h" = "1h",
    limit = 5
): Promise<{ asOf: number; items: TrendingMini[] }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const key = `${timeframe}:${safeLimit}`;
    const now = Date.now();

    if (cache.key === key && now - cache.asOf < CACHE_TTL_MS) {
        return { asOf: cache.asOf, items: cache.data };
    }

    const data = await fetchTrendingMini(timeframe, safeLimit);
    cache = { key, asOf: now, data };
    return { asOf: now, items: data };
}

export const TRENDING_TOKENS_TOOL: ToolHandler = async (
    args: { timeframe?: "5m" | "15m" | "30m" | "1h" | "6h" | "12h" | "24h"; limit?: number } = {},
    _keypair?: Keypair,
    _user?: User
) => {
    const timeframe = args.timeframe ?? "1h";
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 50);

    const payload = await getTrendingStatus(timeframe, limit);
    return { resForAi: payload };
};