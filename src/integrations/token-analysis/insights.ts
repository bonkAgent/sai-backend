import { BirdeyeTokenData } from "./sources/birdeye";
import { SolanaTrackerBundle } from "./sources/solanatracker";
import { SecurityReport } from "./sources/rugcheck";

function classifyMomentum(pct?: number | null): "Explosive" | "Strong" | "Mild" | "Negative" | "N/A" {
    if (pct == null) return "N/A";
    if (pct > 100) return "Explosive";
    if (pct > 50)  return "Strong";
    if (pct >= 0)  return "Mild";
    return "Negative";
}
function fmtPct(n?: number | null): string {
    return (typeof n === 'number' && isFinite(n)) ? `${n.toFixed(2)}%` : "—";
}
function safeDiv(a?: number | null, b?: number | null): number | null {
    if (a == null || b == null || b === 0) return null;
    return a / b;
}
function bsrText(r?: number | null): { ratio: string; interp: string } {
    if (r == null) return { ratio: "—", interp: "—" };
    if (r > 1.5) return { ratio: r.toFixed(2), interp: "bullish dominance (capital inflow)" };
    if (r < 0.7) return { ratio: r.toFixed(2), interp: "bearish dominance (capital exiting)" };
    return { ratio: r.toFixed(2), interp: "balanced market" };
}
function avgTradeSizeUSD(volumeUSD?: number | null, trades?: number | null): number | null {
    const v = safeDiv(volumeUSD, trades);
    return v == null ? null : v;
}
function marketProfile(avg?: number | null): string {
    if (avg == null) return "insufficient data";
    if (avg < 100) return "<$100 avg — retail-driven; higher emotional swing risk";
    if (avg <= 1000) return "$100–$1,000 avg — mixed flow; moderate stability";
    return ">$1,000 avg — whale/institutional-driven; higher capacity, potential large-order impact";
}
function alignment(shortPct?: number | null, midPct?: number | null): string {
    if (shortPct == null || midPct == null) return "insufficient data";
    if (shortPct >= 0 && midPct >= 0) return "aligned up — trend looks sustainable";
    if (shortPct < 0 && midPct < 0) return "aligned down — consolidation/pullback likely";
    if (shortPct > 0 && midPct < 0) return "short spike vs weak mid-term — watch for reversal";
    return "short dip vs strong mid-term — pullback entry potential";
}

export function buildInsightsMarkdown(tok: BirdeyeTokenData): string {
    const mom1 = tok.v5mChangePercent ?? null;
    const mom2 = tok.v30mChangePercent ?? null;
    const mom24 = tok.v24hChangePercent ?? null;
    const momClass = classifyMomentum(mom24);
    const bsr = safeDiv(tok.vBuy24hUSD, tok.vSell24hUSD);
    const bsrInfo = bsrText(bsr);
    const avgSize = avgTradeSizeUSD(tok.v24hUSD ?? null, tok.trade24h ?? null);
    const align = alignment(mom1, mom2);
    const liq = tok.liquidity ?? null;
    const liqText = liq == null ? "liquidity n/a" : liq > 1_000_000 ? "high liquidity" : liq > 250_000 ? "medium liquidity" : "low liquidity";
    const priceLine = [
        tok.priceUsd != null ? `$${tok.priceUsd.toFixed(6)}` : "—",
        tok.priceChange24hPercent != null ? `(${fmtPct(tok.priceChange24hPercent)} 24h)` : ""
    ].filter(Boolean).join(" ");
    const overview = `Price ${priceLine}. 24h volume: ${tok.v24hUSD != null ? `$${tok.v24hUSD.toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"}, ${momClass === "Negative" ? "cooling" : "inflow"} ${fmtPct(mom24)}; ${liqText}.`;
    const momentumLine = `**Momentum:** ${momClass} (${fmtPct(mom24)} 24h).`;
    const bsLine = `**Buy/Sell Pressure:** BSR ${bsrInfo.ratio} — ${bsrInfo.interp}.`;
    const profLine = `**Market Profile:** avg trade size ${avgSize != null ? `$${avgSize.toFixed(0)}` : "—"} → ${marketProfile(avgSize)}.`;
    const tfLine = `**Timeframe Alignment:** ${align}.`;
    let takeaway = "Signals mixed or insufficient — wait for alignment and volume confirmation.";
    if (bsr != null && mom24 != null) {
        if (bsr > 1.5 && mom24 > 0) {
            takeaway = "Buyer dominance with positive momentum — trend-following adds are acceptable with risk controls.";
        } else if (bsr < 0.7 && mom24 < 0) {
            takeaway = "Capital outflow and negative momentum — reduce risk or take partial profits, wait for reversal signals.";
        } else if (mom24 > 0 && avgSize != null && avgSize < 100) {
            takeaway = "Positive momentum with retail profile — upside possible but rally may be fragile without whale support.";
        } else {
            takeaway = "Mixed signals — seek confirmation via liquidity and persistent buy-side volume or size positions smaller.";
        }
    }
    return [
        `## 📊 Market Overview`,
        overview,
        ``,
        `## 🔍 Key Signals`,
        `- ${momentumLine}`,
        `- ${bsLine}`,
        `- ${profLine}`,
        `- ${tfLine}`,
        ``,
        `## 💡 Strategic Takeaway`,
        takeaway,
    ].join("\n");
}

function bandFromScore(x: number): "Very Safe"|"Low"|"Medium"|"High"|"Extreme" {
    if (x <= 10) return "Very Safe";
    if (x <= 25) return "Low";
    if (x <= 45) return "Medium";
    if (x <= 70) return "High";
    return "Extreme";
}
function fmtUSD(n?: number | null): string {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    if (Math.abs(n) >= 1e9) return `$${(n/1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
}
function pctStr(x?: number | null, digits=2): string {
    return typeof x === "number" ? `${x.toFixed(digits)}%` : "—";
}

export function buildSecurityInsights(security: SecurityReport, tok?: BirdeyeTokenData, st?: SolanaTrackerBundle): string {
    const ts = new Date().toISOString();
    const score = Math.round(security?.riskScore ?? 50);
    const band = bandFromScore(score);
    const liqUSD = security?.liquidity?.totalMarketLiquidity ?? null;
    const mcUSD = tok?.marketCap ?? null;
    const relLiq = (liqUSD && mcUSD && mcUSD>0) ? (liqUSD/mcUSD*100) : null;

    const mint = security?.authorities?.mintAuthority;
    const freeze = security?.authorities?.freezeAuthority;
    let authMatrix = "—";
    if (!mint && !freeze) authMatrix = "Decentralized";
    else if (!mint && freeze) authMatrix = "Controllable (freeze risk)";
    else if (mint && !freeze) authMatrix = "Inflationary (mint risk)";
    else if (mint && freeze) authMatrix = "Centralized (mint+freeze)";

    const creatorPct = tok && tok.circulatingSupply ? 0 : null;

    const top1 = (tok as any)?.insidersSummary?.distribution?.top1Pct ?? null;
    const top10 = (tok as any)?.insidersSummary?.distribution?.top10Pct ?? null;

    const lpProv = security?.liquidity?.totalLPProviders ?? null;
    const stableShare = security?.liquidity?.stableRatio != null ? security.liquidity.stableRatio*100 : null;


    const rugged = !!security?.meta?.rugged;
    const tf = security?.transferFee?.pct ?? 0;

    const immediate = rugged
        ? "Rug flag present → Avoid; do not interact."
        : (!mint && !freeze)
            ? "Decentralized authorities; primary control risks low."
            : (mint && freeze)
                ? "Centralized controls active; high dilution/lock risk."
                : (mint ? "Mint active; inflation risk." : "Freeze authority set; potential freeze risk.");

    const critical = [
        `Authorities: ${authMatrix}${mint ? " — mint active" : ""}${freeze ? " — freeze set" : ""}.`,
        `Creator/Distribution: creator ${creatorPct!=null?pctStr(creatorPct):"—"}, top1 ${pctStr(top1)}, top10 ${pctStr(top10)}.`,
        `Liquidity & Structure: ${fmtUSD(liqUSD)} total, rel ${relLiq!=null?relLiq.toFixed(1)+"%":"—"}, LP providers ${lpProv ?? "—"}, stable share ${stableShare!=null?stableShare.toFixed(1)+"%":"—"}.`,
        `Technical: transfer fee ${pctStr((tf??0)*100,2)}; verification ${security?.verification?.jup_verified===true?"ok":"—"}.`
    ].join("\n");

    const capitalSafety = score<=20 ? "high" : score<=40 ? "moderate-high" : score<=60 ? "moderate-low" : score<=80 ? "low" : "very low";
    const exit5k  = liqUSD!=null ? (liqUSD>500_000?"low":liqUSD>100_000?"moderate":"high") : "unknown";
    const exit25k = liqUSD!=null ? (liqUSD>2_000_000?"low":liqUSD>500_000?"moderate":"high") : "unknown";
    const exit100k= liqUSD!=null ? (liqUSD>6_000_000?"low":liqUSD>2_000_000?"moderate":"high") : "unknown";

    const stance =
        score<=10 ? "Operationally safe" :
            score<=25 ? "Acceptable with awareness" :
                score<=45 ? "Elevated risk — small positions only" :
                    score<=70 ? "High risk — recommend avoidance for most users" :
                        "Extreme risk — avoid";

    const sizeGuide =
        score<=10 ? "Normal sizing" :
            score<=25 ? "≤1–2% of portfolio" :
                score<=45 ? "≤0.5–1% with tight stops" :
                    score<=70 ? "Avoid or ≤0.25% only if necessary" :
                        "Avoid";

    const monitoring = [
        `LP changes: if liquidity < $50k or LP providers drop to 1 → exit`,
        `Top10% ownership spike > +5pp in 24h → de-risk`,
        `Creator transfers > 0.5% of circ in 24–72h → caution`,
        `Relative liquidity < 2% → high exit risk`,
        `New/active insider networks > 500 wallets → manipulation risk`
    ].join("\n");

    const missing: string[] = [];
    if (tok?.circulatingSupply == null) missing.push("circulatingSupply");
    if (liqUSD == null) missing.push("liquidityUSD");
    if (mcUSD == null) missing.push("marketCap");
    if (top1 == null || top10 == null) missing.push("holders concentration");
    const incomplete = missing.length ? `Missing: ${missing.join(", ")} — tighten stance; results may skew.` : "";

    return [
        `## 1) IMMEDIATE RISK ASSESSMENT`,
        `Risk Score: ${score}/100 — ${band} (as of ${ts})`,
        immediate,
        ``,
        `## 2) CRITICAL FACTORS (✅/⚠️/🚨)`,
        critical,
        ``,
        `## 3) DETAILED BREAKDOWN`,
        `• Authority: ${authMatrix}`,
        `• Creator & Holders: creator ${creatorPct!=null?pctStr(creatorPct):"—"}, top1 ${pctStr(top1)}, top10 ${pctStr(top10)}`,
        `• Liquidity: ${fmtUSD(liqUSD)} total; relative ${relLiq!=null?relLiq.toFixed(1)+"%":"—"}; LP ${lpProv??"—"}; stable ${stableShare!=null?stableShare.toFixed(1)+"%":"—"}`,
        `• Temporal: ${st?.overview?.created_time? "young asset" : "n/a"}`,
        ``,
        `## 4) BUSINESS CONCLUSIONS`,
        `Capital safety: ${capitalSafety}`,
        `Exit risk on $5k / $25k / $100k: ${exit5k} / ${exit25k} / ${exit100k}`,
        `Suitability: ${score<=20?"operationally safe":score<=40?"small speculative":"avoid for long-term"}`,
        ``,
        `## 5) ACTIONABLE RECOMMENDATION`,
        stance,
        `Position sizing: ${sizeGuide}`,
        `Precautions: prefer limit orders; monitor LP and top holders; watch transfer fee/authority changes`,
        ``,
        `## 6) MONITORING & TRIGGERS`,
        monitoring,
        ``,
        missing.length ? `## 7) INCOMPLETE ANALYSIS\n${incomplete}` : ``,
    ].filter(Boolean).join("\n");
}

/* ---------- HolderScan insights ---------- */

type HolderScanBundle = {
    breakdowns?: any;
    statistics?: any;
    pnl?: any;
    walletCategories?: any;
    supplyBreakdown?: any;
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function nz(n: any, d=0) { return typeof n === "number" && isFinite(n) ? n : d; }
function fmtInt(n?: number | null) { return typeof n === "number" && isFinite(n) ? n.toLocaleString() : "—"; }

function scoreHolderSizeDistribution(b: any, total: number) {
    const gt10   = nz(b?.holders_over_10_usd);
    const gt100  = nz(b?.holders_over_100_usd);
    const gt1k   = nz(b?.holders_over_1000_usd);
    const gt10k  = nz(b?.holders_over_10000_usd);
    const gt100k = nz(b?.holders_over_100k_usd);
    const gt1m   = nz(b?.holders_over_1m_usd);

    const p_dust       = total>0 ? clamp01(Math.max(0, 1 - gt10 / total)) : 0;
    const p_10_100     = total>0 ? clamp01((gt10  - gt100)  / total) : 0;
    const p_100_1k     = total>0 ? clamp01((gt100 - gt1k)   / total) : 0;
    const p_1k_10k     = total>0 ? clamp01((gt1k  - gt10k)  / total) : 0;
    const p_10k_100k   = total>0 ? clamp01((gt10k - gt100k) / total) : 0;
    const p_100k_plus  = total>0 ? clamp01(gt100k / total) : 0;
    const p_1m_plus    = total>0 ? clamp01(gt1m   / total) : 0;

    const M = p_100_1k + p_1k_10k;
    const H = p_10k_100k;
    const W = p_100k_plus;

    let s_dust = p_dust <= 0.50 ? 100 : Math.max(0, 100 - (p_dust - 0.50) * 300);
    const distToMid = M < 0.25 ? 0.25 - M : (M > 0.40 ? M - 0.40 : 0);
    let s_mid  = M>=0.25 && M<=0.40 ? 100 : Math.max(0, 100 - distToMid * 400);
    const distToHigh = H < 0.03 ? 0.03 - H : (H > 0.07 ? H - 0.07 : 0);
    let s_high = H>=0.03 && H<=0.07 ? 100 : Math.max(0, 100 - distToHigh * 400);

    let s_whale = 0;
    if (W >= 0.05) s_whale = 0;
    else if (W >= 0.02) s_whale = 50 * (0.05 - W) / 0.03;
    else if (W >= 0.01) s_whale = 50 + 30 * (0.02 - W) / 0.01;
    else if (W >= 0.005) s_whale = 80 + 10 * (0.01 - W) / 0.005;
    else s_whale = 100;

    if (gt1m >= 1) s_whale = Math.min(s_whale, 60);
    if (gt100k >= 5) s_whale = Math.min(s_whale, 70);

    const HolderSizeDistribution = 0.30*s_dust + 0.40*s_mid + 0.15*s_high + 0.15*s_whale;

    return {
        HolderSizeDistribution,
        shares: { p_dust, M, H, W, p_1m_plus, p_10_100, p_100_1k, p_1k_10k, p_10k_100k },
        subs: { s_dust, s_mid, s_high, s_whale }
    };
}

function scoreLoyaltyChurn(wc: any, sb: any, retention_rate?: number|null, avg_time_held?: number|null) {
    const top = nz(wc?.diamond)+nz(wc?.gold)+nz(wc?.silver)+nz(wc?.bronze)+nz(wc?.wood)+nz(wc?.new_holders);
    const L_dia = top>0 ? wc?.diamond/top : 0;
    const L_gold= top>0 ? wc?.gold   /top : 0;
    const L_silv= top>0 ? wc?.silver /top : 0;
    const L_bron= top>0 ? wc?.bronze /top : 0;
    const L_wood= top>0 ? wc?.wood   /top : 0;
    const L_new = top>0 ? wc?.new_holders/top : 0;

    const S_total = nz(sb?.diamond)+nz(sb?.gold)+nz(sb?.silver)+nz(sb?.bronze)+nz(sb?.wood);
    const S_dia = S_total>0 ? sb?.diamond/S_total : 0;
    const S_gold= S_total>0 ? sb?.gold   /S_total : 0;
    const S_silv= S_total>0 ? sb?.silver /S_total : 0;
    const S_bron= S_total>0 ? sb?.bronze /S_total : 0;
    const S_wood= S_total>0 ? sb?.wood   /S_total : 0;

    const S_long = S_dia + S_gold;
    const S_flip = S_bron + S_wood;
    let s_supply = S_total>0 ? (S_long>=0.50 ? 100 : Math.max(0, 100 - (0.50 - S_long)*200)) : 60;
    s_supply -= Math.max(0, (S_flip - 0.30) * 200);
    s_supply = Math.max(0, Math.min(100, s_supply));

    const C_long = L_dia + L_gold + L_silv;
    let s_count = top>0 ? (C_long>=0.50 ? 100 : Math.max(0, 100 - (0.50 - C_long)*150)) : 60;
    if ((L_wood + L_new) >= 0.30) s_count = Math.min(s_count, 70);

    let s_behav = 60;
    const s_ret = typeof retention_rate === "number" ? Math.max(0, Math.min(100, retention_rate*100)) : null;
    const s_ten = typeof avg_time_held === "number" ? Math.min(100, ((avg_time_held/86400)/60)*100) : null;
    if (s_ret!=null && s_ten!=null) s_behav = 0.6*s_ret + 0.4*s_ten;
    else if (s_ret!=null) s_behav = s_ret;
    else if (s_ten!=null) s_behav = s_ten;

    const LoyaltyChurn = 0.50*s_supply + 0.30*s_count + 0.20*s_behav;

    return {
        LoyaltyChurn,
        norm: { L_dia,L_gold,L_silv,L_bron,L_wood,L_new },
        supply: { S_dia,S_gold,S_silv,S_bron,S_wood,S_long,S_flip,S_total },
        subs: { s_supply,s_count,s_behav },
        topBase: top
    };
}

function scoreConcentrationEquality(hhi?: number|null, gini?: number|null, whalesByCount?: number) {
    let subH = 60, subG = 60;
    if (typeof hhi === "number") {
        if (hhi <= 0.10) subH = 100;
        else if (hhi <= 0.25) subH = 100 - ((hhi - 0.10) / 0.15) * 60;
        else subH = Math.max(0, 40 - ((hhi - 0.25) / 0.25) * 40);
    }
    if (typeof gini === "number") {
        if (gini <= 0.75) subG = 100;
        else if (gini <= 0.90) subG = 100 - ((gini - 0.75) / 0.15) * 60;
        else subG = Math.max(0, 40 - ((gini - 0.90) / 0.10) * 40);
    }
    let ConcentrationEquality: number;
    if (typeof hhi === "number" && typeof gini === "number") ConcentrationEquality = 0.6*subH + 0.4*subG;
    else if (typeof hhi === "number") ConcentrationEquality = subH;
    else if (typeof gini === "number") ConcentrationEquality = subG;
    else ConcentrationEquality = 60;
    if (typeof whalesByCount === "number" && whalesByCount >= 0.02) ConcentrationEquality = Math.min(ConcentrationEquality, 60);
    return { ConcentrationEquality, subs:{subH,subG} };
}

function labelAndSizing(score: number) {
    if (score >= 80) return { label:"Excellent", sizing:"up to 5%" };
    if (score >= 60) return { label:"Good", sizing:"up to 3%" };
    if (score >= 40) return { label:"Caution", sizing:"≤1%" };
    return { label:"High Risk", sizing:"Avoid or ≤0.5%" };
}

export function buildHolderDistributionInsights(
    hs: HolderScanBundle | null | undefined,
    ctx?: { currentPrice?: number|null; marketCap?: number|null; fdv?: number|null }
): string | null {
    if (!hs || !hs.breakdowns) return null;

    const b = hs.breakdowns || {};
    const s = hs.statistics || {};
    const pnl = hs.pnl || {};
    const wc = hs.walletCategories || {};
    const sb = hs.supplyBreakdown || {};

    const total = nz(b?.total_holders);
    const shares = scoreHolderSizeDistribution(b, total);
    const loyalty = scoreLoyaltyChurn(wc, sb, s?.retention_rate ?? null, s?.avg_time_held ?? null);
    const conc = scoreConcentrationEquality(s?.hhi ?? null, s?.gini ?? null, shares.shares.W);

    let BaseScore = 0.35*shares.HolderSizeDistribution + 0.35*loyalty.LoyaltyChurn + 0.10*conc.ConcentrationEquality;
    if (total > 0 && total < 200) BaseScore *= 0.90;

    const price = ctx?.currentPrice ?? null;
    const be = typeof pnl?.break_even_price === "number" ? pnl.break_even_price : null;
    const unreal = typeof pnl?.unrealized_pnl_total === "number" ? pnl.unrealized_pnl_total : null;
    const realz = typeof pnl?.realized_pnl_total === "number" ? pnl.realized_pnl_total : null;

    const above = (price!=null && be!=null) ? price > 1.15*be : false;
    const below = (price!=null && be!=null) ? price < 0.85*be : false;
    const largeUnrealProfit = typeof unreal === "number" && unreal > 0;
    const largeUnrealLoss   = typeof unreal === "number" && unreal < 0;

    let PnL_Mod = 0;
    if (above && largeUnrealProfit) PnL_Mod += (loyalty.LoyaltyChurn < 60 ? -20 : -10);
    if (below && largeUnrealLoss)   PnL_Mod += (loyalty.LoyaltyChurn >= 70 ? +10 : -10);
    if (typeof realz === "number" && Math.abs(realz) > 0 && typeof unreal === "number" && Math.abs(unreal) < Math.abs(realz)/4) PnL_Mod += 5;
    const FinalHolderHealth = Math.max(0, Math.min(100, BaseScore + PnL_Mod));

    const lab = labelAndSizing(FinalHolderHealth);

    const dustPct = shares.shares.p_dust*100;
    const midPct  = (shares.shares.p_100_1k + shares.shares.p_1k_10k)*100;
    const highPct = shares.shares.p_10k_100k*100;
    const whalePct= shares.shares.W*100;

    const exec = (() => {
        const stability = FinalHolderHealth>=80 ? "strong resiliency and low dump risk" :
            FinalHolderHealth>=60 ? "solid resiliency with manageable dump risk" :
                FinalHolderHealth>=40 ? "fragile structure; elevated volatility and dump risk" :
                    "high centralization/flip risk; unstable orderbook";
        const pressure = above && largeUnrealProfit ? "profit-taking overhang likely on pumps" :
            below && largeUnrealLoss ? "capitulation risk on bounces unless loyal base absorbs supply" :
                "neutral near-term pressure";
        return `Overall holder health ${FinalHolderHealth.toFixed(0)}/100 (${lab.label}) — ${stability}; ${pressure}.`;
    })();

    const distr = `Size Mix (by count): Dust ${dustPct.toFixed(1)}%, Middle $100–$10k ${midPct.toFixed(1)}%, High-tier $10k–$100k ${highPct.toFixed(1)}%, Whales ≥$100k ${whalePct.toFixed(2)}% → middle layer drives liquidity absorption; whales control ${whalePct.toFixed(2)}% by count${shares.shares.p_1m_plus>0?`, mega-whales present (~${(shares.shares.p_1m_plus*100).toFixed(2)}%)`:""}.`;

    const loyaltyTxt = (() => {
        const longSupply = (loyalty.supply.S_long*100)||0;
        const flipSupply = (loyalty.supply.S_flip*100)||0;
        const noteTop = (loyalty.topBase>0) ? " (loyalty mix among top-1000 holders)" : "";
        return `Loyalty & Churn${noteTop}: Diamond+Gold supply ${longSupply.toFixed(1)}%, Bronze+Wood ${flipSupply.toFixed(1)}% → ${longSupply>=50?"resilient core likely to hold dips":"shallow loyal base; sell-into-strength likely"}${flipSupply>30?" with flip-overhang":""
        }. Retention/tenure proxy: ${loyalty.subs.s_behav.toFixed(0)}/100.`;
    })();

    const concTxt = (() => {
        const hhiStr = typeof s?.hhi === "number" ? s.hhi.toFixed(3) : "—";
        const giniStr= typeof s?.gini=== "number" ? s.gini.toFixed(3) : "—";
        return `Concentration: HHI ${hhiStr}, Gini ${giniStr} → ${conc.ConcentrationEquality.toFixed(0)}/100 decentralization score${shares.shares.W>=0.02?" (capped due to ≥2% whales by count)":""
        }. Watch for hidden concentration if equality looks poor despite low whale share.`;
    })();

    const pnlTxt = (() => {
        const beStr = be!=null ? `$${be.toFixed(6)}` : "—";
        const curStr= price!=null ? `$${price.toFixed(6)}` : "—";
        const unrealStr = unreal!=null ? (unreal>=0?`+$${Math.abs(unreal).toLocaleString()}`:`-$${Math.abs(unreal).toLocaleString()}`) : "—";
        const realzStr  = realz!=null ? (realz>=0?`+$${Math.abs(realz).toLocaleString()}`:`-$${Math.abs(realz).toLocaleString()}`) : "—";
        const pressure = above && largeUnrealProfit ? "sell-wall risk on pumps" :
            below && largeUnrealLoss ? (loyalty.LoyaltyChurn>=70 ?"value-buyer absorption likely":"capitulation overhang") :
                "no clear PnL overhang";
        return `Break-even ${beStr} vs current ${curStr}; Unrealized ${unrealStr}, Realized ${realzStr} → ${pressure}.`;
    })();

    const strategy = (() => {
        const guide = lab.sizing;
        const next = `Track whales (≥$100k) and Diamond+Gold supply share; re-score if whales by count >2% or Diamond+Gold <45% or if Dust >55%.`;
        return `Risk label: ${lab.label}. Sizing: ${guide}. ${next}`;
    })();

    const totalsLine = `Holders: total ${fmtInt(total)}, ≥$10 ${fmtInt(b?.holders_over_10_usd)}, ≥$100 ${fmtInt(b?.holders_over_100_usd)}, ≥$1k ${fmtInt(b?.holders_over_1000_usd)}, ≥$10k ${fmtInt(b?.holders_over_10000_usd)}, ≥$100k ${fmtInt(b?.holders_over_100k_usd)}, ≥$1m ${fmtInt(b?.holders_over_1m_usd)}.`;

    return [
        `## 🧩 Holder Structure Assessment`,
        `**Executive View.** ${exec}`,
        ``,
        `### 🔧 Distribution Drivers`,
        distr,
        loyaltyTxt,
        concTxt,
        ``,
        `### ⚠️ Immediate Pressure (PnL)`,
        pnlTxt,
        ``,
        `### 📈 Strategy & Sizing`,
        strategy,
        ``,
        `—`,
        totalsLine
    ].join("\n");
}