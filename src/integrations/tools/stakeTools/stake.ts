import {Connection, Keypair, LAMPORTS_PER_SOL} from "@solana/web3.js";
import {User} from "@privy-io/server-auth";
import fetch from "node-fetch";
import BN from "bn.js";
import {getBalances} from "../../../services/mongoService";
import {enoughMoney} from "../../../utils/enoughMoney";
import {Marinade, MarinadeConfig} from "@marinade.finance/marinade-ts-sdk";
import {TOOL_HANDLERS} from "../../../promtsAI/tool-handlers";
import {formatBlock, JITOSOL_MINT, JPOOL_MINT} from "./utils";

export async function LIST_STAKING_OPTIONS (args: any, keypair?: Keypair, user?:User) {
    let marinadeApy = 'N/A';
    let jitoApy = 'N/A';
    const JPOOL_HARD_APY = "9%";

    try {
        const res = await fetch('https://api.marinade.finance/msol/apy/7d');
        const json = await res.json();
        if (typeof json.value === "number") {
            marinadeApy = (json.value * 100).toFixed(2) + '%';
        }
    } catch (e) {
        console.error("[Marinade APY fetch error]", e);
    }

    try {
        const jitoRes = await fetch(
            'https://api.expand.network/liquidstaking/getapr?liquidStakingId=900',
            { headers: { "x-api-key": process.env.EXPAND_API_KEY || "" } }
        );
        const jitoJson = await jitoRes.json();
        if (jitoJson?.data?.apr) {
            jitoApy = Number(jitoJson.data.apr).toFixed(2) + "%";
        }
    } catch (e) {
        console.error("[Jito APY fetch error]", e);
    }

    const unwrapToken = async (ticker: string) => {
        const res = await TOOL_HANDLERS.GET_TOKEN_DATA({ ticker }, keypair, user);
        return typeof res.resForAi === 'string' ? null : res.resForAi;
    };

    const [marinadeToken, jitoToken, jpoolToken] = await Promise.all([
        unwrapToken('mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'),
        unwrapToken('J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'),
        unwrapToken('JPool2J1zL6Xc8CSkM7wr5ubzjzpxbJ9mDiiAAGGVzZc'),
    ]);

    const text = [
        `## Solana Staking Platforms\n`,
        formatBlock({
            platform: "Marinade",
            apy: marinadeApy,
            url: "https://marinade.finance/app/staking",
            type: "Liquid staking (mSOL)",
            description: "Liquid staking with mSOL receipt token.",
            token: marinadeToken
        }),
        formatBlock({
            platform: "Jito",
            apy: jitoApy,
            url: "https://stake.jito.network/",
            type: "Liquid staking (JitoSOL)",
            description: "Liquid staking with JitoSOL receipt token.",
            token: jitoToken
        }),
        formatBlock({
            platform: "JPool",
            apy: JPOOL_HARD_APY,
            url: "https://jpool.one/",
            type: "Liquid staking (JPoolSOL)",
            description: "Liquid staking with JPoolSOL receipt token.",
            token: jpoolToken
        }),
        "_You can stake SOL and get receipt tokens (mSOL, JitoSOL or JPoolSOL) that can be used in DeFi or traded while still earning rewards._"
    ].join('\n');

    return {
        resForAi: {markdown: text},
        resForStatus: {text},
    };
}

export async function STAKE (args: { amount: number, platform: string }, keypair?: Keypair, user?:User) {
    if (!keypair) throw new Error("Keypair is required for STAKE");
    if (!user) throw new Error("User is required for STAKE");
    if(args.platform === "MARINADE"){
        const connection = new Connection(process.env.RPC_URL!);
        const amountLamports = new BN(Math.floor(args.amount * LAMPORTS_PER_SOL));

        const balance  = await getBalances(user);
        if(!enoughMoney(balance, args.amount, "So11111111111111111111111111111111111111112", 0.0002)){
            return {resForAi:{ status: `Error user dont have enough moaney` }}
        }
        // config marinadesdk
        const config = new MarinadeConfig({
            connection,
            publicKey: keypair.publicKey,
        });
        const marinade = new Marinade(config);

        try {
            // generating
            const { transaction } = await marinade.deposit(amountLamports);

            // sign + send
            const txid = await connection.sendTransaction(transaction, [keypair]);
            await connection.confirmTransaction(txid);

            return {
                resForAi:{
                    status: "success",
                    transactionId: txid,
                    details: `Staked ${args.amount} SOL via Marinade. You received mSOL.`,},
                resForStatus:{
                    status: "success",
                    transactionId: txid,
                    details: `Staked ${args.amount} SOL via Marinade. You received mSOL.`,},
            };
        } catch (e: any) {
            return { resForAi:{status: "error", message: e.message || e.toString()} };
        }
    }else if(args.platform === "JITO"){
        const { amount } = args;
        return await TOOL_HANDLERS.SWAP({
            from: "SOL",
            to: JITOSOL_MINT,
            amount: amount.toString()
        }, keypair, user);
    }else if(args.platform === "JPOOL"){
        return await TOOL_HANDLERS.SWAP({
            from: JPOOL_MINT,
            to: "SOL",
            amount: args.amount.toString()
        }, keypair, user);
    }
    return {resForAi:`such platform doesnt exists ${args.platform}`}
}

export async function UNSTAKE (args: { amount: number, platform: String }, keypair?: Keypair, user?:User) {
    if (!keypair) throw new Error("Keypair is required for UNSTAKE");
    if (!user) throw new Error("User is required for UNSTAKE");
    if(args.platform === "MARINADE"){
        const connection = new Connection(process.env.RPC_URL!);

        const balance = await getBalances(user);
        if(!enoughMoney(balance, 0, "So11111111111111111111111111111111111111112", 0.0002)){
            return {resForAi:{ status: `Error user dont have enough moaney` }}
        }

        const amountLamports = new BN(Math.floor(args.amount * LAMPORTS_PER_SOL));

        // config marinadesdk
        const config = new MarinadeConfig({
            connection,
            publicKey: keypair.publicKey,
        });
        const marinade = new Marinade(config);

        try {
            // generating
            const { transaction } = await marinade.deposit(amountLamports);

            // sign + send
            const txid = await connection.sendTransaction(transaction, [keypair]);
            await connection.confirmTransaction(txid);

            return {
                resForAi:{
                    status: "success",
                    transactionId: txid,
                    details: `Staked ${args.amount} SOL via Marinade. You received mSOL.`,},
                resForStatus:{
                    status: "success",
                    transactionId: txid,
                    details: `Staked ${args.amount} SOL via Marinade. You received mSOL.`,},
            };
        } catch (e: any) {
            return { resForAi:{status: "error", message: e.message || e.toString()},resForStatus:{status: "error", message: e.message || e.toString()} };
        }
    }else if(args.platform === "JITO"){
        const { amount } = args;
        return await TOOL_HANDLERS.SWAP({
            from: JITOSOL_MINT,
            to: "SOL",
            amount: amount.toString()
        }, keypair, user);
    }else if(args.platform === "JPOOL"){
        return await TOOL_HANDLERS.SWAP({
            from: JPOOL_MINT,
            to: "SOL",
            amount: args.amount.toString()
        }, keypair, user);
    }
    return {resForAi:`such platform doesnt exists ${args.platform}`}
}