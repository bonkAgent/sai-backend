import fetch from "node-fetch";
import { KAMINO_API_BASE, DEFAULT_CLUSTER } from "./constants";
import { 
    KaminoReserveHistoryParams, 
    KaminoObligationPnlParams,
    KaminoUserObligationsParams 
} from "./types";

export async function getMarkets(programId: string) {
    try {
        const url = `${KAMINO_API_BASE}/kamino-market?programId=${programId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Kamino API error ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (error) {
        throw error;
    }
}

export async function getMarket(marketPubkey: string, programId: string) {
    try {
        const url = `${KAMINO_API_BASE}/kamino-market/${marketPubkey}?programId=${programId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Kamino API error ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (error) {
        throw error;
    }
}

export async function getReserves(marketPubkey: string, env: string = DEFAULT_CLUSTER, programId?: string) {
    const qs = new URLSearchParams({ env });
    if (programId) qs.set('programId', programId);
    const url = `${KAMINO_API_BASE}/kamino-market/${marketPubkey}/reserves?${qs.toString()}`;
    try {
        const res = await fetch(url);
        if (res.status === 404) {
            // try v2 fallback shape if exists in future
            const res2 = await fetch(`${KAMINO_API_BASE}/v2/kamino-market/${marketPubkey}/reserves?${qs.toString()}`);
            if (!res2.ok) throw new Error(`Kamino API error ${res2.status}: ${res2.statusText}`);
            return await res2.json();
        }
        if (!res.ok) throw new Error(`Kamino API error ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (error) {
        throw error;
    }
}

export async function getReserveHistory(params: KaminoReserveHistoryParams) {
    try {
        const { market, reserve, start, end, frequency = "day", env = DEFAULT_CLUSTER } = params;
        const queryParams = new URLSearchParams({
            env,
            frequency,
            ...(start && { start }),
            ...(end && { end }),
        });
        const url = `${KAMINO_API_BASE}/kamino-market/${market}/reserves/${reserve}/metrics/history?${queryParams}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Kamino API error ${res.status}: ${res.statusText}`);
        const raw = await res.json();

        const historyArr: any[] = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.history)
                ? raw.history.map((h: any) => ({ timestamp: h?.timestamp, ...(h?.metrics || {}) }))
                : [];

        const toNum = (v: any) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };

        const normalized = historyArr.map((h: any) => ({
            timestamp: h?.timestamp || h?.time || null,
            tvl: toNum(h?.tvl),
            supplyApy: toNum(h?.supplyApy ?? h?.supplyInterestAPY) * (h?.supplyInterestAPY != null ? 100 : 1),
            borrowApy: toNum(h?.borrowApy ?? h?.borrowInterestAPY) * (h?.borrowInterestAPY != null ? 100 : 1),
            utilization: toNum(h?.utilization ?? h?.utilizationRatio) * (h?.utilizationRatio != null ? 100 : 1),
            symbol: h?.symbol,
            reserve: reserve,
        }));

        return normalized;
    } catch (error) {
        throw error;
    }
}

export async function getUserObligations(params: KaminoUserObligationsParams) {
    try {
        const { market, user, env = DEFAULT_CLUSTER } = params;
        const url = `${KAMINO_API_BASE}/kamino-market/${market}/users/${user}/obligations?env=${env}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Kamino API error ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (error) {
        throw error;
    }
}

export async function getObligationPnl(params: KaminoObligationPnlParams) {
    try {
        const { market, obligation, positionMode = "current_obligation", useStakeRate = false } = params;
        const queryParams = new URLSearchParams({
            positionMode,
            ...(useStakeRate && { useStakeRate: "true" }),
        });
        const url = `${KAMINO_API_BASE}/v2/kamino-market/${market}/obligations/${obligation}/pnl/?${queryParams}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Kamino API error ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (error) {
        throw error;
    }
}

export async function getReserveCurrentMetrics(market: string, reserve: string, env: string = DEFAULT_CLUSTER, programId?: string) {
    const qs = new URLSearchParams({ env });
    if (programId) qs.set('programId', programId);
    try {
        const url = `${KAMINO_API_BASE}/kamino-market/${market}/reserves/${reserve}/metrics?${qs.toString()}`;
        let res = await fetch(url);
        if (res.status === 404) {
            res = await fetch(`${KAMINO_API_BASE}/v2/kamino-market/${market}/reserves/${reserve}/metrics?${qs.toString()}`);
        }
        if (!res.ok) throw new Error(`Kamino API error ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (error) {
        throw error;
    }
}

export async function getReservesMetrics(market: string, env: string = DEFAULT_CLUSTER) {
    try {
        const url = `${KAMINO_API_BASE}/kamino-market/${market}/reserves/metrics?env=${env}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Kamino API error ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (error) {
        throw error;
    }
}
