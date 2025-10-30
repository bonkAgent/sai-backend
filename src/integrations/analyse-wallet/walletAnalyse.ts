import {
    stepGetPortfolioAllCached,
    normalizeSpot,
    normalizeYield,
    sumUsd,
    clampArray,
    Spot,
    YieldPosition,
    StepModules,
} from "./sources/step";

const STABLE_SYMBOLS = new Set(["USDC", "USDT", "USDC.E", "USDT.E"]);

export function buildWalletOutput(step: any) {
    const aggregated = step?.summary?.aggregated || {};
    const moduleTotals = step?.summary?.positions || {};
    const positions = step?.positions || {};
    const token = positions?.token || {};

    const spot: Spot[] = normalizeSpot(token.spot);
    const yieldPositions: YieldPosition[] = normalizeYield(token.yield);

    const tokenPositions = [...spot, ...yieldPositions];
    const tokenValue = (moduleTotals?.token?.spot?.totalValue || 0) + (moduleTotals?.token?.yield?.totalValue || 0);

    const defiBreakdown = {
        liquidity: (moduleTotals?.liquidity?.amm?.totalValue || 0) + (moduleTotals?.liquidity?.clmm?.totalValue || 0),
        staking: moduleTotals?.staking?.totalValue || 0,
        farm: moduleTotals?.farm?.totalValue || 0,
        lending:
            (moduleTotals?.lending?.tokenPosition?.totalValue || 0) +
            (moduleTotals?.lending?.leverageFarmPosition?.totalValue || 0) +
            (moduleTotals?.lending?.nftPosition?.totalValue || 0),
        margin: moduleTotals?.margin?.totalValue || 0,
        vault: moduleTotals?.vault?.totalValue || 0,
        dex:
            (moduleTotals?.dex?.order?.totalValue || 0) +
            (moduleTotals?.dex?.unsettledBalance?.totalValue || 0) +
            (moduleTotals?.dex?.repeatingOrder?.totalValue || 0),
        nft: moduleTotals?.nft?.totalValue || 0,
        nftmarket:
            (moduleTotals?.nftmarket?.singleOrder?.totalValue || 0) +
            (moduleTotals?.nftmarket?.poolOrder?.totalValue || 0) +
            (moduleTotals?.nftmarket?.escrowAccount?.totalValue || 0),
        validator: moduleTotals?.validator?.totalValue || 0,
        domain: moduleTotals?.domain?.totalValue || 0,
    };

    const computedNetWorth = sumUsd(tokenPositions) + Object.values(defiBreakdown).reduce((a, b) => a + (Number(b) || 0), 0);
    const netWorth = Number(aggregated.netWorth || 0) || computedNetWorth;

    const ranked = [...tokenPositions].sort((a, b) => b.valueInUSD - a.valueInUSD);
    const rankedWithShare = ranked.map((t) => ({
        address: t.mint,
        symbol: t.symbol,
        uiAmount: t.balance,
        valueInUSD: t.valueInUSD,
        sharePct: netWorth > 0 ? +(t.valueInUSD / netWorth * 100).toFixed(2) : 0,
    }));

    const stableUsd = rankedWithShare
        .filter((x) => x.symbol && STABLE_SYMBOLS.has(x.symbol.toUpperCase()))
        .reduce((a, x) => a + x.valueInUSD, 0);
    const stableSharePct = netWorth > 0 ? +(stableUsd / netWorth * 100).toFixed(2) : 0;

    const shares = rankedWithShare.map((x) => (x.sharePct || 0) / 100);
    const hhi = +shares.reduce((a, s) => a + s * s, 0).toFixed(4);
    const slicePct = (n: number) => +rankedWithShare.slice(0, n).reduce((a, x) => a + (x.sharePct || 0), 0).toFixed(2);

    const pendingRewards =
        (moduleTotals?.farm?.totalPendingReward || 0) +
        (moduleTotals?.staking?.totalPendingReward || 0) +
        (moduleTotals?.liquidity?.clmm?.totalPendingReward || 0) +
        (moduleTotals?.nftmarket?.poolOrder?.totalPendingReward || 0);

    const notes: string[] = [];
    if (stableSharePct < 10) notes.push("Low stablecoin share (<10%)");
    if (slicePct(1) > 50) notes.push("High concentration in top asset (>50%)");
    if (hhi > 0.3) notes.push("Elevated portfolio concentration (HHI>0.30)");
    if ((moduleTotals?.dex?.unsettledBalance?.totalValue || 0) > 0) notes.push("Unsettled balances on DEX");
    if (pendingRewards > 0) notes.push("Pending rewards available");

    const resForAi = {
        type: "wallet_analysis",
        summary: `Net worth ≈ $${netWorth.toFixed(2)} · Tokens $${tokenValue} · DeFi $${(netWorth - tokenValue).toFixed(2)}`,
        rewards: {
            est24h: step?.summary?.aggregated?.estimated24hReward || 0,
            pending: step?.summary?.aggregated?.totalPendingReward || pendingRewards || 0,
        },
        defiBreakdown,
        topTokens: rankedWithShare.slice(0, 8).map((x) => ({
            symbol: x.symbol,
            valueInUSD: x.valueInUSD,
            sharePct: x.sharePct,
        })),
        concentration: { top1Pct: slicePct(1), top3Pct: slicePct(3), top10Pct: slicePct(10), hhi },
        stableSharePct,
        notes,
    };

    const resForStatus = {
        aggregated: step?.summary?.aggregated || { netWorth },
        byModuleTotals: moduleTotals,
        tokens: {
            spot: clampArray(spot, 200),
            yield: clampArray(yieldPositions, 200),
        },
        defi: {
            liquidity: {
                amm: clampArray(positions?.liquidity?.amm || [], 200),
                clmm: clampArray(positions?.liquidity?.clmm || [], 200),
            },
            staking: clampArray(positions?.staking || [], 200),
            farm: clampArray(positions?.farm || [], 200),
            lending: {
                tokenPosition: clampArray(positions?.lending?.tokenPosition || [], 200),
                leverageFarmPosition: clampArray(positions?.lending?.leverageFarmPosition || [], 200),
                nftPosition: clampArray(positions?.lending?.nftPosition || [], 200),
            },
            margin: clampArray(positions?.margin || [], 200),
            vault: clampArray(positions?.vault || [], 200),
            dex: {
                order: clampArray(positions?.dex?.order || [], 200),
                unsettledBalance: clampArray(positions?.dex?.unsettledBalance || [], 200),
                repeatingOrder: clampArray(positions?.dex?.repeatingOrder || [], 200),
            },
            nftmarket: positions?.nftmarket || {},
            nft: clampArray(positions?.nft || [], 200),
            validator: clampArray(positions?.validator || [], 200),
            domain: clampArray(positions?.domain || [], 200),
        },
    };

    return { resForAi, resForStatus };
}

export async function analyzeWallet(address: string, _modules?: StepModules) {
    const raw = await stepGetPortfolioAllCached(address);
    return buildWalletOutput(raw);
}