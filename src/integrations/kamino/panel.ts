import { PublicKey } from "@solana/web3.js";
import { kaminoGetJson } from "./http";
import { loadTokensMap, fallbackLogo, KaminoToken } from "./tokens";
import { KAMINO_MAIN_MARKET } from "./constants";

const toNum = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : null;
};
const pct = (x: any): number | null => {
    const n = toNum(x);
    if (n === null) return null;
    return Math.round(n * 10000) / 100;
};
const round2 = (x: any): number => Math.round((Number(x) || 0) * 100) / 100;
const pick = (obj: any, keys: string[]): number | null => {
    for (const k of keys) {
        const n = toNum(obj?.[k]);
        if (n !== null) return n;
    }
    return null;
};

export type CreditRow = {
    symbol: string;
    mint: string;
    logoURI: string;
    totalSupplyUsd: number;
    totalBorrowUsd: number;
    liqLtv: number | null;
    supplyApy: number | null;
    borrowApy: number | null;
};

export type CreditBureauResponse = {
    market: string;
    rows: CreditRow[];
    asOf: number;
    asOfIso: string;
};

export async function buildKaminoCreditBureau(opts?: {
    market?: string;
    env?: "mainnet-beta" | "devnet";
}): Promise<CreditBureauResponse> {
    const market = (opts?.market ?? KAMINO_MAIN_MARKET).trim();
    const env: "mainnet-beta" | "devnet" = opts?.env ?? "mainnet-beta";

    try { new PublicKey(market); } catch {
        throw new Error(`Invalid Kamino market pubkey: "${market}"`);
    }

    const tokensByMint = await loadTokensMap();

    type Metric = Record<string, any>;
    const metrics: Metric[] = await kaminoGetJson(
        `/kamino-market/${market}/reserves/metrics`,
        { env }
    );

    const rows: CreditRow[] = [];
    for (const m of metrics) {
        const mint = String(m?.liquidityTokenMint || m?.liquidityMint || m?.mint || "") || "";
        const token: KaminoToken | undefined = mint ? tokensByMint[mint] : undefined;

        const symbol = (m?.liquidityToken || m?.mintSymbol || token?.symbol || "UNKNOWN").trim();
        const logoURI = token?.logoURI || (mint ? fallbackLogo(mint) : "no_URI");

        const liqLtv = pct(
            pick(m, [
                "maxLtv",
                "liquidationThreshold",
                "liquidationLtv",       
                "liquidationLTV",
                "liqLtv",
                "liqLTV",
            ])
        );

        const totalSupplyUsd = round2(
            pick(m, ["totalSupplyUsd", "totalDepositsUsd", "depositsUsd", "totalLiquiditySupplyUsd", "tvlUsd"]) ?? 0
        );
        const totalBorrowUsd = round2(
            pick(m, ["totalBorrowUsd", "totalBorrowsUsd", "borrowsUsd", "borrowUsd"]) ?? 0
        );

        rows.push({
            symbol,
            mint,
            logoURI,
            totalSupplyUsd,
            totalBorrowUsd,
            liqLtv,
            supplyApy: pct(m?.supplyApy),
            borrowApy: pct(m?.borrowApy),
        });
    }

    rows.sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd);

    const asOf = Date.now();
    return { market, rows, asOf, asOfIso: new Date(asOf).toISOString() };
}