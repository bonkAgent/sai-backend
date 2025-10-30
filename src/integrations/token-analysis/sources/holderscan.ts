import fetch from "node-fetch";

const BASE  = "https://api.holderscan.com/v0";
const CHAIN = "sol";
const HS_KEY = process.env.HOLDER_SCAN_API_KEY;

const hsHeaders: Record<string,string> = {
    Accept: "application/json",
    ...(HS_KEY ? { "x-api-key": HS_KEY } : {}),
    ...(HS_KEY ? { Authorization: `Bearer ${HS_KEY}` } : {}),
};

const getJson = async (url: string) => {
    try {
        const res = await fetch(url, {
            headers: {
                "x-api-key": HS_KEY || "",
                "accept": "application/json",
            },
        });
        if (!res.ok) {
            const text = await res.text().catch(()=> "");
            throw new Error(`HTTP ${res.status} on ${url} — ${text || res.statusText}`);
        }
        return await res.json();
    } catch (e) {
        console.error("[HolderScan]", e);
        return null;
    }
};

export interface HolderScanBundle {
    breakdowns?: any;
    statistics?: any;
    pnl?: any;
    walletCategories?: any;
    supplyBreakdown?: any;
}

export async function getHolderScanData(tokenAddr: string): Promise<HolderScanBundle> {
    const bundle: HolderScanBundle = {};
    const base = `${BASE}/${CHAIN}/tokens/${tokenAddr}`;

    const [breakdowns, statistics, pnl, walletCategories, supplyBreakdown] = await Promise.all([
        getJson(`${base}/holders/breakdowns`),
        getJson(`${base}/stats`),
        getJson(`${base}/stats/pnl`),
        getJson(`${base}/stats/wallet-categories`),
        getJson(`${base}/stats/supply-breakdown`),
    ]);

    if (breakdowns)       bundle.breakdowns = breakdowns;
    if (statistics)       bundle.statistics = statistics;
    if (pnl)              bundle.pnl = pnl;
    if (walletCategories) bundle.walletCategories = walletCategories;
    if (supplyBreakdown)  bundle.supplyBreakdown = supplyBreakdown;

    return bundle;
}