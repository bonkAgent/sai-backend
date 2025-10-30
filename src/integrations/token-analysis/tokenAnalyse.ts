import { Keypair } from "@solana/web3.js";
import { User } from "@privy-io/server-auth";
import { getBalances } from "../../services/mongoService";
import { tryFetchFromBirdeye } from "./sources/birdeye";
import { tryFetchFromSolanaTracker } from "./sources/solanatracker";
import { getCreatorBalanceFromBirdeye } from "./birdeyeCreatorBalance";
import { assessRugpull } from "./sources/rugcheck";
import {buildHolderDistributionInsights, buildInsightsMarkdown, buildSecurityInsights} from "./insights";
import {getHolderScanData} from "./sources/holderscan";

export async function getTokenDataHandler(args: { ticker: string }, _kp?: Keypair, user?: User) {
    if (!user) throw new Error("User is required for GET_TOKEN_DATA");
    let input = args.ticker;
    if (!input.match(/^.{32,44}$/)) {
        const balance = await getBalances(user);
        const tokens = balance.filter((b: any) => (b.symbol || "").toUpperCase() === input.toUpperCase());
        if (tokens.length > 1) {
            return { resForAi: { status: "There are more than 1 token with such ticker", tokens } };
        }
        if (tokens.length === 1) {
            input = tokens[0].address;
        } else {
            return { resForAi: { status: `Error user dont have token ${input}` } };
        }
    }
    try {
        const [birdEye, stBundle] = await Promise.all([
            tryFetchFromBirdeye(input),
            tryFetchFromSolanaTracker(input),
        ]);
        if (!birdEye) {
            return { resForAi: `can't find any info about ${input}` };
        }
        const creatorAddr = stBundle?.overview?.creator ?? null;
        let creatorBalance = null;
        if (creatorAddr) {
            creatorBalance = await getCreatorBalanceFromBirdeye(creatorAddr, input);
        }
        const security = await assessRugpull(input, { stBundle });
        const circ = Number(birdEye?.circulatingSupply ?? 0);
        if (circ > 0) {
            const holders = Array.isArray(birdEye?.topHolders) ? birdEye!.topHolders : [];
            const holdersPct = holders.map(h => ({
                ...h,
                percent: (Number(h.balance) / circ) * 100
            }));
            const sorted = [...holdersPct].sort((a,b)=>Number(b.balance)-Number(a.balance));
            const top1Pct  = sorted.slice(0,1).reduce((a,h)=>a+(Number(h.percent)||0),0);
            const top3Pct  = sorted.slice(0,3).reduce((a,h)=>a+(Number(h.percent)||0),0);
            const top10Pct = sorted.slice(0,10).reduce((a,h)=>a+(Number(h.percent)||0),0);
            const creatorAmt = Number(creatorBalance?.token?.uiAmount ?? 0);
            const creatorPct = (creatorAmt / circ) * 100;
        }

        const holderScan = await getHolderScanData(input).catch(()=>null);
        const holderInsights = buildHolderDistributionInsights(
            holderScan || null,
            { currentPrice: birdEye?.priceUsd ?? null, marketCap: birdEye?.marketCap ?? null, fdv: birdEye?.fdv ?? null }
        );

        const insights = {
            market: birdEye ? buildInsightsMarkdown(birdEye) : null,
            security: security ? buildSecurityInsights(security, birdEye || undefined, stBundle || undefined) : null,
            holders: holderInsights || null,
        };
        return {
            resForAi: {
                ...birdEye,
                solanaTracker: stBundle,
                creation: stBundle?.overview || null,
                creatorBalance,
                security,
                holderScan,
                insights
            },
            resForStatus: {
                ...birdEye,
                solanaTracker: stBundle,
                creation: stBundle?.overview || null,
                creatorBalance,
                security,
                holderScan,
            },
        };
    } catch (e: any) {
        return { resForAi: `can't find any info about ${input} (${e.message || e})` };
    }
}
