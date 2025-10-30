import fetch from "node-fetch";
import { Connection, PublicKey } from "@solana/web3.js";

type BirdeyeTokenBalanceResp = {
    success: boolean;
    data?: {
        address: string;
        decimals: number;
        balance: number;
        uiAmount: number;
        symbol?: string;
        name?: string;
        priceUsd?: number;
    };
    message?: string;
};

export type CreatorBalance = {
    wallet: string;
    sol: { lamports: number; balance: number } | null;
    token: {
        mint: string;
        uiAmount: number;
        decimals: number | null;
        symbol?: string;
        name?: string;
        priceUsd?: number;
        ataExists: boolean;
        accountCount: number;
        source: "birdeye" | "rpc";
    } | null;
};

const BIRDEYE_BASE = (process.env.BIRDEYE_BASE || "https://public-api.birdeye.so").trim();
const BIRDEYE_API_KEY = (process.env.BIRDEYE_API_KEY || "").trim();
const RPC_URL = (process.env.RPC_URL || "").trim();

export async function getCreatorBalanceFromBirdeye(creator: string, mint: string): Promise<CreatorBalance> {
    const out: CreatorBalance = { wallet: creator, sol: null, token: null };

    // 1) SOL
    try {
        const conn = new Connection(RPC_URL, "confirmed");
        const lamports = await conn.getBalance(new PublicKey(creator));
        out.sol = { lamports, balance: lamports / 1e9 };
    } catch (e: any) {
        console.error(`[CreatorBalance] SOL via RPC error: ${e?.message || e}`);
    }

    const rpcFallback = async () => {
        try {
            const conn = new Connection(RPC_URL, "confirmed");
            const owner = new PublicKey(creator);
            const mintPk = new PublicKey(mint);
            const { value } = await conn.getParsedTokenAccountsByOwner(owner, { mint: mintPk });

            let uiAmount = 0;
            let decimals: number | null = null;

            value.forEach(({ account }) => {
                const info = (account.data as any).parsed?.info;
                const ta = info?.tokenAmount;
                if (ta) {
                    decimals = typeof ta.decimals === "number" ? ta.decimals : decimals;
                    const amt = typeof ta.uiAmount === "number" ? ta.uiAmount : 0;
                    uiAmount += amt;
                }
            });

            return {
                mint,
                uiAmount,
                decimals,
                ataExists: value.length > 0,
                accountCount: value.length,
                source: "rpc" as const,
            };
        } catch (e: any) {
            console.error(`[CreatorBalance] SPL via RPC fallback error: ${e?.message || e}`);
            return null;
        }
    };


    try {
        if (!BIRDEYE_API_KEY) throw new Error("BIRDEYE_API_KEY is empty");

        const url = new URL(`${BIRDEYE_BASE}/v1/wallet/token_balance`);
        url.searchParams.set("wallet", creator);
        url.searchParams.set("token_address", mint);
        url.searchParams.set("ui_amount_mode", "scaled");

        const res = await fetch(url.toString(), {
            headers: {
                accept: "application/json",
                "x-chain": "solana",
                "X-API-KEY": BIRDEYE_API_KEY,
            },
        });

        if (!res.ok) {
            const fb = await rpcFallback();
            if (fb) out.token = fb;
            return out;
        }

        const json = (await res.json()) as BirdeyeTokenBalanceResp;

        if (!json.success || !json.data) {
            const fb = await rpcFallback();
            if (fb) out.token = fb;
            return out;
        }

        const d = json.data;
        out.token = {
            mint: d.address,
            uiAmount: d.uiAmount ?? 0,
            decimals: d.decimals ?? null,
            symbol: d.symbol,
            name: d.name,
            priceUsd: d.priceUsd,
            ataExists: (d.uiAmount ?? 0) > 0,
            accountCount: (d.uiAmount ?? 0) > 0 ? 1 : 0,
            source: "birdeye",
        };


        if ((d.uiAmount ?? 0) === 0) {
            const fb = await rpcFallback();
            if (fb) out.token = fb;
        }
    } catch (e: any) {
        console.error(`[CreatorBalance] SPL via Birdeye error: ${e?.message || e}`);
        const fb = await rpcFallback();
        if (fb) out.token = fb;
    }

    return out;
}