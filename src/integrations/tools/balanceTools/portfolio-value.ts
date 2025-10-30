import {Keypair} from "@solana/web3.js";
import {User} from "@privy-io/server-auth";
import {decrementNeedToBalance, getBalances, getToolStatus} from "../../../services/mongoService";
import {TOOL_HANDLERS} from "../../../promtsAI/tool-handlers";
import {getSolPriceCached} from "../priceTools/utils";
import {slowMetaAndPrice} from "./utils";


export async function GET_PORTFOLIO_VALUE(_args: any, keypair?: Keypair, user?: User) {
    if (!user) throw new Error("User is required for GET_PORTFOLIO_VALUE");
    if (!keypair) throw new Error("Keypair is required for GET_PORTFOLIO_VALUE");

    let balances = await getBalances(user);
    const toolStatus = await getToolStatus(user) as any;
    const needRefresh = !balances || balances === "User not found" || (toolStatus?.needToBalance ?? 0) > 0 || _args.needRefresh;

    if (needRefresh) {
        const fresh = (await TOOL_HANDLERS.GET_BALANCE({}, keypair, user)).resForAi?.balances;
        try { await decrementNeedToBalance(user); } catch {}
        balances = fresh ?? balances ?? [];
    }


    const solPrice = await getSolPriceCached();
    const { metas, prices } = await slowMetaAndPrice(balances, solPrice);

    let totalValue = 0;
    const breakdown = balances.map((t: any, i: number) => {
        const meta     = metas[i] || {};
        const rawPrice = prices[i];
        const priceUsd = (rawPrice == null || !Number.isFinite(rawPrice)) ? 0 : rawPrice;
        const valueUsd = Number(t.balance) * priceUsd;

        totalValue += valueUsd;

        return {
            symbol  : t.symbol ?? meta.symbol ?? (t.address.slice(0, 4) + '...'),
            address : t.address,
            name    : t.name ?? meta.name ?? 'Unknown',
            balance : t.balance,

            logoURI : t.logoURI ?? meta.logoURI ?? null,
            decimals: t.decimals ?? meta.decimals,
            priceUsd,
            valueUsd: +valueUsd.toFixed(2),
        };
    });

    return {
        resForAi: {
            totalValue: +totalValue.toFixed(2),
            breakdown
        }
    };
}