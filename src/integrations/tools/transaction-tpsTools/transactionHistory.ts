import {Connection, Keypair} from "@solana/web3.js";
import {parseTransactionDetails} from "./utils";

export async function GET_TRANSACTION_HISTORY (args: { limit: number }, keypair?: Keypair) {
    if (!keypair) throw new Error("Keypair is required for ...");
    const limit = (args && typeof args.limit === 'number') ? args.limit : 5;
    console.log(`[HANDLER GET_TRANSACTION_HISTORY] Fetching last ${limit} transactions for ${keypair?.publicKey.toBase58()}`);
    try {
        const connection = new Connection(process.env.RPC_URL!);
        const signatures = await connection.getSignaturesForAddress(keypair.publicKey, { limit });
        if (!signatures || signatures.length === 0) {
            return { history: [] };
        }

        const transactions = [];
        for (const sig of signatures) {
            const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            const description = parseTransactionDetails(tx, keypair.publicKey.toBase58());
            transactions.push({
                signature: sig.signature,
                date: new Date(sig.blockTime! * 1000).toLocaleString(),
                description: description,
                status: sig.confirmationStatus
            });
        }
        return { resForAi:{transactions}};
    } catch (error: any) {
        return { resForAi:{error: `Failed to get transaction history: ${error.message}` }};
    }
}