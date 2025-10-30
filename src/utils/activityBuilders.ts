import { toUsd } from "../promtsAI/tool-handlers";

export const buildTransferActivity = async (args: any, raw: any) => {
    const st = raw?.resForStatus;
    if (!st) return null;
    const tAddr = st?.token?.address ?? args?.tokenSymbol ?? "So1111...";
    const amount = st?.amount ?? null;
    return {
        amount,
        token: { symbol: st?.token?.symbol ?? null, address: tAddr },
        txid: st?.transactionId ?? null,
        meta: { to: st?.to ?? null },
        usdAmount: await toUsd(amount, tAddr),
    };
};

export const buildSwapActivity = async (_args: any, raw: any) => {
    const st = raw?.resForStatus;
    if (!st) return null;
    const amount = st?.amountFrom ?? null;
    const fromAddr = st?.from?.address;
    return {
        amount,
        token: { symbol: st?.from?.symbol ?? null, address: fromAddr },
        txid: st?.id ?? null,
        meta: { toToken: st?.to, amountTo: st?.amountTo },
        usdAmount: await toUsd(amount, fromAddr),
    };
};

export const buildStakeActivity = async (args: any, raw: any) => {
    const st = raw?.resForStatus;
    if (!st) return null;
    const baseMint = "So11111111111111111111111111111111111111112";
    const amount = args?.amount ?? null;
    return {
        amount,
        token: { symbol: "SOL", address: baseMint },
        txid: st?.transactionId ?? null,
        meta: { platform: args?.platform, details: st?.details ?? null },
        usdAmount: await toUsd(amount, baseMint),
    };
};

export const buildDepositBorrowActivity = async (_args: any, raw: any) => {
    const st = raw?.resForStatus;
    if (!st) return null;
    return {
        amount: st?.amount ?? null,
        token: { address: st?.token?.address, symbol: st?.token?.symbol ?? null },
        txid: st?.transactionId ?? null,
        meta: st,
        usdAmount: await toUsd(st?.amount, st?.token?.address),
    };
};

const KAMINO_MINTS: Record<string, string> = {
    SOL: "So11111111111111111111111111111111111111112",
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    MSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    JITOSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
};

export const buildKaminoLendActivity = (op: string) => async (args: any, raw: any) => {
    const st = raw?.resForStatus;
    if (!st) return null;
    const mint = KAMINO_MINTS[(args?.token || "").toUpperCase()] || args?.token;
    const amount = args?.amount ?? null;
    return {
        amount,
        token: { symbol: args?.token ?? null, address: mint ?? null },
        txid: st?.transactionId ?? null,
        meta: { platform: "Kamino", operation: op.toLowerCase(), priorityFee: args?.priorityFee },
        usdAmount: mint ? await toUsd(amount, mint) : null,
    };
};