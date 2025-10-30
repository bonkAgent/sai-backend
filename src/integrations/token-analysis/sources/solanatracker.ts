import fetch from "node-fetch";

type Json = Record<string, any>;

export type SolanaTrackerAth = {
    highest_market_cap?: number | null;
};

export type SolanaTrackerOverview = {
    creator?: string | null;
    created_tx?: string | null;
    created_time?: number | null;
    created_on?: string | null;
};

export type SolanaTrackerTokenRaw = {
    token?: any;
    pools?: any[];
    events?: any;
    risk?: {
        snipers?: {
            count?: number;
            totalBalance?: number;
            totalPercentage?: number;
            wallets?: Array<{ wallet: string; balance: number; percentage: number }>;
        };
        [k: string]: any;
    };
    [k: string]: any;
};

export type SolanaTrackerBundle = {
    platform: "solana";
    address: string;
    ath?: SolanaTrackerAth | null;
    overview?: SolanaTrackerOverview | null;
    raw?: {
        ath?: Json | null;
        overview?: (Json & SolanaTrackerTokenRaw) | null;
    };
};

const BASE = process.env.SOLANATRACKER_BASE_URL || "https://data.solanatracker.io";
const API_KEY = process.env.SOLANATRACKER_API_KEY || "";

function isMint(a: string) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
}

async function fetchJson(url: string): Promise<{ ok: boolean; json: Json | null; text: string }> {
    const res = await fetch(url, {
        headers: { "X-API-KEY": API_KEY, Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, json: null, text };
    let j: Json | null = null;
    try { j = JSON.parse(text); } catch { j = null; }
    return { ok: true, json: j, text };
}

// ath
export async function retrieveAthFromSolanaTracker(mintAddress: string): Promise<{ data: SolanaTrackerAth | null; raw: Json | null }> {
    if (!isMint(mintAddress)) return { data: null, raw: null };
    const url = `${BASE}/tokens/${encodeURIComponent(mintAddress)}/ath`;
    try {
        const { ok, json, text } = await fetchJson(url);
        if (!ok || !json) {
            console.error(`[SolanaTracker ATH] ${ok ? "ParseError" : "HTTP"} → ${text}`);
            return { data: null, raw: json ?? null };
        }
        const out: SolanaTrackerAth = {
            highest_market_cap: json?.highest_market_cap ?? null,
        };
        return { data: out, raw: json };
    } catch (e) {
        console.error("[SolanaTracker ATH] fetch error", e);
        return { data: null, raw: null };
    }
}

// overview
export async function retrieveOverviewFromSolanaTracker(
    mintAddress: string
): Promise<{ data: SolanaTrackerOverview | null; raw: Json | null }> {
    if (!isMint(mintAddress)) return { data: null, raw: null };
    const url = `${BASE}/tokens/${encodeURIComponent(mintAddress)}`;

    try {
        const { ok, json, text } = await fetchJson(url);
        if (!ok || !json) {
            console.error(`[SolanaTracker Overview] ${ok ? "ParseError" : "HTTP"} → ${text}`);
            return { data: null, raw: json ?? null };
        }

        const creation = json?.token?.creation ?? null;

        const out: SolanaTrackerOverview = {
            creator: creation?.creator ?? null,
            created_tx: creation?.created_tx ?? null,
            created_time: creation?.created_time ?? null,
            created_on: json?.token?.createdOn ?? null,
        };

        return { data: out, raw: json };
    } catch (e) {
        console.error("[SolanaTracker Overview] fetch error", e);
        return { data: null, raw: null };
    }
}

export async function tryFetchFromSolanaTracker(mintAddress: string): Promise<SolanaTrackerBundle | null> {
    if (!isMint(mintAddress)) return null;

    const [ath,overview] = await Promise.allSettled([
        retrieveAthFromSolanaTracker(mintAddress),
        retrieveOverviewFromSolanaTracker(mintAddress),
    ]);

    const athVal = ath.status === "fulfilled" ? ath.value : { data: null, raw: null };
    const overviewVal = overview.status === "fulfilled" ? overview.value : { data: null, raw: null };

    return {
        platform: "solana",
        address: mintAddress,
        ath: athVal.data,
        overview: overviewVal.data,
        raw: {
            ath: athVal.raw,
            overview: overviewVal.raw,
        },
    };
}