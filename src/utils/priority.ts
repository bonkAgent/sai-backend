import {
    Transaction,
    VersionedTransaction,
    MessageV0,
    ComputeBudgetProgram,
} from "@solana/web3.js";

const DEFAULT_LIMIT = 200_000;

export function addPriority(
    tx: Transaction | VersionedTransaction,
    microLamports: number,
    limit: number = DEFAULT_LIMIT
) {
    if (!microLamports) return;

    console.log(`[PRIORITY] CU price = ${microLamports} µLamports, limit = ${limit}`);

    if (!(tx instanceof Transaction)) return;

    const limitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: limit });
    const priceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
    tx.instructions.unshift(limitIx, priceIx);
}