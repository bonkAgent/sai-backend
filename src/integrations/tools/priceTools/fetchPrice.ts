import {Keypair} from "@solana/web3.js";
import {User} from "@privy-io/server-auth";
import {getBalances} from "../../../services/mongoService";
import {findTokenInBalance, getTokenPriceUsd} from "./utils";
import {getTokenMetadataFast} from "../balanceTools/utils";


export async function FETCH_PRICE (args: { tickers: string[] }, _kp?: Keypair, user?: User)  {
    if(!user)  throw new Error("User is required for FETCH_PRICE");
    const { tickers } = args;
    const results: Record<string, { price: number, symbol?: string, name?: string }> = {};

    const solPrice = await getTokenPriceUsd('So11111111111111111111111111111111111111112');

    const balance = await getBalances(user);
    for (let input of tickers) {
        if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input)) {
            const tokens = findTokenInBalance(balance, input);
            if (tokens.length === 1) input = tokens[0].address;
            else continue;
        }
        const [price, meta] = await Promise.all([
            getTokenPriceUsd(input, solPrice ?? undefined),
            getTokenMetadataFast(input)
        ]);
        if (price != null) {
            results[input] = { price, symbol: meta?.symbol, name: meta?.name };
        }
    }
    return { resForAi: { prices: results }
    };
}