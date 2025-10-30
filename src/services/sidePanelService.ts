
import {
    Keypair,
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction
} from '@solana/web3.js';

import { TOOL_HANDLERS } from "../promtsAI/tool-handlers";
import {addPriority} from "../utils/priority";

const portfolioCache = new Map<string, { at: number; data: any }>();
const PORTFOLIO_TTL = 15_000;

export async function getKaelusBalance(keypair: Keypair, user: any): Promise<{
    breakdown: Array<{
        symbol?: string;
        address: string;
        name?: string;
        logoURI?: string;
        balance: number;
        decimals?: number;
        priceUsd?: number | null;
        valueUsd?: number;
    }>;
    totalInUsd?: number;
}> {
    const cacheKey = `kp:${keypair.publicKey.toBase58()}`;
    const hit = portfolioCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PORTFOLIO_TTL) return hit.data;

    const { resForAi } = await TOOL_HANDLERS.GET_PORTFOLIO_VALUE({needRefresh: true}, keypair, user);
    const { totalValue = 0, breakdown = [] } = (resForAi ?? {}) as {
        totalValue: number;
        breakdown: Array<{ symbol?: string; address: string; name?: string; balance: number; priceUsd?: number; valueUsd?: number; logoURI?: string | null; decimals?: number }>;
    };

    const enriched = breakdown.map((t) => ({
        symbol:   t.symbol,
        address:  t.address,
        name:     t.name,
        logoURI:  (t as any).logoURI ?? null,
        balance:  Number(t.balance) || 0,
        decimals: (t as any).decimals,
        priceUsd: Number.isFinite(t.priceUsd) ? Number(t.priceUsd) : 0,
        valueUsd: Number.isFinite(t.valueUsd) ? +Number(t.valueUsd).toFixed(2) : 0,
    }));

    const data = {
        breakdown: enriched,
        totalInUsd: +(+totalValue).toFixed(2)
    };

    portfolioCache.set(cacheKey, { at: Date.now(), data });
    return data;
}

export async function getPhantomBalance(user: any): Promise<String> {
    const connection = new Connection(process.env.RPC_URL!);
    const publicKey = new PublicKey(user.wallet?.address!);
    const lamports = await connection.getBalance(publicKey);
    return String(lamports / 1e9);
}

export async function transaction(keypair: Keypair, toPubkey :PublicKey, amount: number, priorityFee: number = 0): Promise<void> {
    const connection = new Connection(process.env.RPC_URL!);

    const transaction = new Transaction().add(
    SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey,
        lamports: amount * LAMPORTS_PER_SOL,
    })
    );
    addPriority(transaction, priorityFee, 20_000);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    transaction.sign(keypair);

    const signature = await connection.sendRawTransaction(transaction.serialize());
    return;
}

