import {LAMPORTS_PER_SOL} from "@solana/web3.js";

export function parseTransactionDetails(tx: any, userAddress: string): string {
    if (!tx || !tx.meta || !tx.transaction) return "Could not parse transaction.";

    const { preBalances, postBalances } = tx.meta;
    const { instructions } = tx.transaction.message;
    const userAccountIndex = tx.transaction.message.accountKeys.findIndex((key: any) => key.pubkey.toBase58() === userAddress);

    if (userAccountIndex === -1) return "Complex transaction.";

    const userBalanceChange = postBalances[userAccountIndex] - preBalances[userAccountIndex];
    const changeInSol = userBalanceChange / LAMPORTS_PER_SOL;

    if (Math.abs(changeInSol) > 0.00001) { // Filter out tiny fee changes
        return changeInSol > 0
            ? `Received ~${changeInSol.toFixed(5)} SOL`
            : `Sent ~${(-changeInSol).toFixed(5)} SOL`;
    }

    // Fallback for more complex transactions
    return `Complex transaction with ${instructions.length} instructions.`;
}