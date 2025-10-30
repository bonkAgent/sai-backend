import { kaminoGetJson } from "./http";

export type KaminoToken = {
    address: string;
    symbol: string;
    logoURI?: string | null;
};

let tokensCache: Record<string, KaminoToken> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 1000 * 60 * 30; // 30 min

export async function loadTokensMap(): Promise<Record<string, KaminoToken>> {
    const now = Date.now();
    if (tokensCache && (now - cacheTimestamp) < CACHE_TTL) {
        return tokensCache;
    }

    try {
        const arr: any[] = await kaminoGetJson("/tokens");
        const map: Record<string, KaminoToken> = {};
        
        for (const t of arr || []) {
            const mint = String(t?.address || "");
            if (!mint) continue;
            map[mint] = {
                address: mint,
                symbol: (t?.symbol || "").trim() || "UNKNOWN",
                logoURI: t?.logoURI || null,
            };
        }

        tokensCache = map;
        cacheTimestamp = now;
        
        return map;
    } catch (error) {
        console.error("[KAMINO_TOKENS] Error loading tokens:", error);
        return tokensCache || {};
    }
}

export function fallbackLogo(mint: string): string {
    return "no_URI";
}

export async function resolveTokenMint(token: string): Promise<string | null> {
    const tokenUpper = token.toUpperCase().trim();

    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)) {
        return token;
    }

    const tokensMap = await loadTokensMap();

    for (const [mint, tokenInfo] of Object.entries(tokensMap)) {
        if (tokenInfo.symbol.toUpperCase() === tokenUpper) {
            return mint;
        }
    }

    return null;
}

export async function getTokenInfo(mint: string): Promise<KaminoToken | null> {
    const tokensMap = await loadTokensMap();
    return tokensMap[mint] || null;
}

export async function getAllAvailableTokens(): Promise<KaminoToken[]> {
    const tokensMap = await loadTokensMap();
    return Object.values(tokensMap);
}

export async function isTokenSupported(token: string): Promise<boolean> {
    const mint = await resolveTokenMint(token);
    return mint !== null;
}