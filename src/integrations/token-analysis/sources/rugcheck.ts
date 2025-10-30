import fetch from "node-fetch";
import { tryFetchFromSolanaTracker, SolanaTrackerBundle } from "../sources/solanatracker";

const RUGCHECK_BASE = process.env.RUGCHECK_BASE_URL || "https://api.rugcheck.xyz/v1";
const RUGCHECK_JWT  = process.env.RUGCHECK_JWT || "";

type Json = Record<string, any>;

export type RugcheckRisk = { name: string; description?: string; level?: string; score?: number; value?: string };

export type RugcheckReport = {
    mint: string;
    score?: number|null;
    score_normalised?: number|null;
    price?: number|null;
    totalMarketLiquidity?: number|null;
    totalStableLiquidity?: number|null;
    totalLPProviders?: number|null;
    risks?: RugcheckRisk[]|null;
    mintAuthority?: string|null;
    freezeAuthority?: string|null;
    tokenProgram?: string|null;
    tokenType?: string|null;
    token_extensions?: string|null;
    totalHolders?: number|null;
    transferFee?: { authority?: string; pct?: number; maxAmount?: number }|null;
    verification?: {
        jup_verified?: boolean|null;
        jup_strict?: boolean|null;
        description?: string|null;
        links?: Array<{ provider: string; value: string }>|null;
    }|null;
    launchpad?: { name?:string; platform?:string; url?:string; logo?:string }|null;
    knownAccounts?: Record<string, { name:string; type:string }>|null;
    rugged?: boolean|null;
    detectedAt?: string|null;
    events?: Array<{ createdAt:string; event:number; newValue?:string; oldValue?:string }>|null;
};

export type SecurityCategory =
    | "✅ Very Safe" | "⚠️ Low Risk" | "⚠️ Medium Risk" | "🚨 High Risk" | "🚨 Extreme Risk" | "Unknown";

export type SecurityFlagLevel = "red" | "yellow" | "green";
export type SecurityFlag = {
    key: string;
    level: SecurityFlagLevel;
    label: string;
    message: string;
};

export type SecurityReport = {
    mint: string;
    riskScore: number;
    category: SecurityCategory;
    flags: SecurityFlag[];
    liquidity: {
        totalMarketLiquidity: number|null;
        totalStableLiquidity: number|null;
        totalLPProviders: number|null;
        stableRatio: number|null;
    };
    authorities: {
        mintAuthority: string|null;
        freezeAuthority: string|null;
    };
    verification?: {
        jup_verified?: boolean|null;
        jup_strict?: boolean|null;
        description?: string|null;
        links?: Array<{ provider: string; value: string }>|null;
    };
    totals: {
        totalHolders: number|null;
        price: number|null;
        votes: { up:number; down:number; userVoted?: boolean }|null;
    };
    meta: {
        tokenProgram: string|null;
        tokenType: string|null;
        tokenExtensions: string|null;
        knownAccounts: Array<{ key:string; name:string; type:string }>|null;
        launchpad: { name?:string; platform?:string; url?:string; logo?:string }|null;
        detectedAt: string|null;
        rugged: boolean|null;
        events: RugcheckReport["events"]|null;
    };
    transferFee?: { authority?: string; pct?: number; maxAmount?: number }|null;
    sources: { rugcheck: boolean; solanaTracker: boolean };
    risksRaw?: RugcheckRisk[];
    originalScores?: { score?: number|null; score_normalised?: number|null };
    snipers?: {
        count: number | null;
        totalBalance: number | null;
        totalPercentage: number | null;
        wallets: Array<{ wallet: string; balance: number; percentage: number }>;
    } | null;
};

function authHeaders(): Record<string,string> {
    return { Accept: "application/json", ...(RUGCHECK_JWT ? { Authorization: `Bearer ${RUGCHECK_JWT}` } : {}) };
}

async function rcGet(path: string): Promise<{ ok:boolean; json:Json|null; text:string }> {
    const res = await fetch(`${RUGCHECK_BASE}${path}`, { headers: authHeaders() });
    const text = await res.text();
    if (!res.ok) return { ok:false, json:null, text };
    let j: Json|null = null; try { j = JSON.parse(text); } catch {}
    return { ok:true, json:j, text };
}

function categoryFromScore(score: number): SecurityCategory {
    if (!isFinite(score)) return "Unknown";
    if (score <= 10)  return "✅ Very Safe";
    if (score <= 30)  return "⚠️ Low Risk";
    if (score <= 60)  return "⚠️ Medium Risk";
    if (score <= 80)  return "🚨 High Risk";
    return "🚨 Extreme Risk";
}

function hasRisk(risks: RugcheckRisk[]|null|undefined, key: string): boolean {
    if (!risks || risks.length === 0) return false;
    return risks.some(r => (r.name || "").toLowerCase() === key.toLowerCase());
}

async function fetchReportFull(mint: string): Promise<RugcheckReport|null> {
    const r = await rcGet(`/tokens/${encodeURIComponent(mint)}/report`);
    if (r.ok && r.json) {
        const j = r.json;
        return {
            mint,
            score: j?.score ?? null,
            score_normalised: j?.score_normalised ?? null,
            price: j?.price ?? null,
            totalMarketLiquidity: j?.totalMarketLiquidity ?? j?.total_market_liquidity ?? null,
            totalStableLiquidity: j?.totalStableLiquidity ?? j?.total_stable_liquidity ?? null,
            totalLPProviders: j?.totalLPProviders ?? j?.total_lp_providers ?? null,
            risks: j?.risks ?? null,
            mintAuthority: j?.mintAuthority ?? null,
            freezeAuthority: j?.freezeAuthority ?? null,
            tokenProgram: j?.tokenProgram ?? null,
            tokenType: j?.tokenType ?? null,
            token_extensions: j?.token_extensions ?? null,
            totalHolders: j?.totalHolders ?? null,
            transferFee: j?.transferFee ?? null,
            verification: j?.verification ?? null,
            launchpad: j?.launchpad ?? null,
            knownAccounts: j?.knownAccounts ?? null,
            rugged: j?.rugged ?? null,
            detectedAt: j?.detectedAt ?? null,
            events: j?.events ?? null,
        };
    }
    const s = await rcGet(`/tokens/${encodeURIComponent(mint)}/report/summary`);
    if (!s.ok || !s.json) return null;
    const sj = s.json;
    return {
        mint,
        score: sj?.score ?? null,
        score_normalised: sj?.score_normalised ?? null,
        totalMarketLiquidity: sj?.totalMarketLiquidity ?? sj?.total_market_liquidity ?? null,
        totalStableLiquidity: sj?.totalStableLiquidity ?? sj?.total_stable_liquidity ?? null,
        totalLPProviders: sj?.totalLPProviders ?? sj?.total_lp_providers ?? null,
        risks: sj?.risks ?? null,
        price: sj?.price ?? null,
        tokenProgram: sj?.tokenProgram ?? null,
        tokenType: sj?.tokenType ?? null,
    };
}

async function fetchVotes(mint: string): Promise<{ up:number; down:number; userVoted?:boolean }|null> {
    const r = await rcGet(`/tokens/${encodeURIComponent(mint)}/votes`);
    if (!r.ok || !r.json) return null;
    return { up: r.json?.up ?? 0, down: r.json?.down ?? 0, userVoted: r.json?.userVoted ?? undefined };
}

function buildFlags(rc: RugcheckReport|null, st: SolanaTrackerBundle|null): SecurityFlag[] {
    const f: SecurityFlag[] = [];
    const risks = rc?.risks ?? [];
    if (hasRisk(risks, "mint_authority_retained")) f.push({ key: "mint_authority_retained", level: "red", label: "Mint authority", message: "Creator can still mint more tokens." });
    if (hasRisk(risks, "freeze_authority_retained")) f.push({ key: "freeze_authority_retained", level: "yellow", label: "Freeze authority", message: "Creator can freeze transfers." });
    if (hasRisk(risks, "no_liquidity")) f.push({ key: "no_liquidity", level: "red", label: "Liquidity", message: "No liquidity detected." });
    if (hasRisk(risks, "low_liquidity")) f.push({ key: "low_liquidity", level: "yellow", label: "Liquidity", message: "Low total liquidity." });
    if (hasRisk(risks, "high_creator_percentage")) f.push({ key: "high_creator_percentage", level: "yellow", label: "Creator allocation", message: "Creator holds a high share of the supply." });
    if (hasRisk(risks, "suspicious_volume_patterns")) f.push({ key: "suspicious_volume_patterns", level: "red", label: "Volume anomalies", message: "Suspicious volume patterns detected." });
    const lpProv = Number(rc?.totalLPProviders ?? 0);
    if (isFinite(lpProv) && lpProv > 0 && lpProv < 3) f.push({ key: "centralized_liquidity", level: "yellow", label: "LP providers", message: "Less than 3 independent LP providers." });
    const total  = Number(rc?.totalMarketLiquidity ?? 0);
    const stable = Number(rc?.totalStableLiquidity ?? 0);
    if (isFinite(total) && total > 0) {
        const ratio = stable / total;
        if (total < 50_000) f.push({ key: "liquidity_low_usd", level: "yellow", label: "Liquidity depth", message: "Total liquidity < $50k." });
        if (isFinite(ratio) && ratio < 0.30) f.push({ key: "unstable_liquidity", level: "yellow", label: "Stable liquidity", message: "Stable pools < 30% of total." });
    }
    if (!st?.overview?.creator) f.push({ key: "creator_unknown", level: "yellow", label: "Creator", message: "Creator unknown (no overview data)." });
    if (rc?.verification && rc.verification.jup_verified === false) f.push({ key: "not_verified", level: "yellow", label: "Verification", message: "Not Jupiter verified." });
    if (rc?.transferFee?.pct && rc.transferFee.pct > 0) f.push({ key: "transfer_fee_set", level: "yellow", label: "Transfer fee", message: `Transfer fee is set to ${rc.transferFee.pct}%.` });
    if (rc?.rugged) f.push({ key: "rugged_detected", level: "red", label: "Rug flag", message: "Token flagged as rugged." });
    const sn = (st as any)?.raw?.overview?.risk?.snipers;
    if (sn?.count > 0) {
        if (sn.totalPercentage >= 1) f.push({ key: "snipers_high", level: "red", label: "Snipers", message: `Snipers detected: ${sn.count}, holding ${(sn.totalPercentage*100).toFixed(2)}%` });
        else f.push({ key: "snipers_present", level: "yellow", label: "Snipers", message: `Snipers detected: ${sn.count}` });
    }
    return f;
}

export async function assessRugpull(mint: string, opts?: { stBundle?: SolanaTrackerBundle|null }): Promise<SecurityReport> {
    const [rc, st, votes] = await Promise.all([
        fetchReportFull(mint),
        opts?.stBundle ? Promise.resolve(opts.stBundle) : tryFetchFromSolanaTracker(mint),
        fetchVotes(mint).catch(()=>null)
    ]);
    const stRisk = st?.raw?.overview?.risk;
    const snipers = stRisk?.snipers
        ? {
            count: stRisk.snipers.count ?? null,
            totalBalance: stRisk.snipers.totalBalance ?? null,
            totalPercentage: stRisk.snipers.totalPercentage ?? null,
            wallets: Array.isArray(stRisk.snipers.wallets) ? stRisk.snipers.wallets : [],
        }
        : null;
    const s = rc?.score_normalised ?? rc?.score;
    const riskScore = (typeof s === "number" && isFinite(s)) ? Math.max(0, Math.min(100, s)) : 50;
    const category  = categoryFromScore(riskScore);
    const total  = rc?.totalMarketLiquidity ?? null;
    const stable = rc?.totalStableLiquidity ?? null;
    const stableRatio = (typeof total === "number" && total > 0 && typeof stable === "number")
        ? +(stable / total).toFixed(4)
        : (total === 0 ? 0 : null);
    const flags = buildFlags(rc, st ?? null);
    const knownAccounts = rc?.knownAccounts
        ? Object.entries(rc.knownAccounts).map(([key, val]: any) => ({ key, name: val?.name, type: val?.type }))
        : null;

    return {
        mint,
        riskScore,
        category,
        flags,
        liquidity: {
            totalMarketLiquidity: typeof total === "number" ? total : null,
            totalStableLiquidity: typeof stable === "number" ? stable : null,
            totalLPProviders: typeof rc?.totalLPProviders === "number" ? rc.totalLPProviders : null,
            stableRatio,
        },
        authorities: {
            mintAuthority: rc?.mintAuthority ?? null,
            freezeAuthority: rc?.freezeAuthority ?? null,
        },
        verification: rc?.verification ? {
            jup_verified: rc.verification.jup_verified ?? null,
            jup_strict: rc.verification.jup_strict ?? null,
            description: rc.verification.description ?? null,
            links: Array.isArray(rc.verification.links) ? rc.verification.links : null,
        } : undefined,
        totals: {
            totalHolders: typeof rc?.totalHolders === "number" ? rc.totalHolders : null,
            price: typeof rc?.price === "number" ? rc.price : null,
            votes: votes || null,
        },
        snipers,
        meta: {
            tokenProgram: rc?.tokenProgram ?? null,
            tokenType: rc?.tokenType ?? null,
            tokenExtensions: rc?.token_extensions ?? null,
            knownAccounts,
            launchpad: rc?.launchpad ?? null,
            detectedAt: rc?.detectedAt ?? null,
            rugged: rc?.rugged ?? null,
            events: rc?.events ?? null,
        },
        transferFee: rc?.transferFee ?? null,
        sources: { rugcheck: !!rc, solanaTracker: !!st },
        risksRaw: rc?.risks ?? undefined,
        originalScores: { score: rc?.score ?? null, score_normalised: rc?.score_normalised ?? null }
    };
}
