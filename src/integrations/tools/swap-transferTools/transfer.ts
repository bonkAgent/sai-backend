import {Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction} from "@solana/web3.js";
import {User} from "@privy-io/server-auth";
import {getBalances} from "../../../services/mongoService";
import {enoughMoney} from "../../../utils/enoughMoney";
import {addPriority} from "../../../utils/priority";
import {createTransferInstruction, getOrCreateAssociatedTokenAccount} from "@solana/spl-token";
import {findSolanaToken, findTokenInBalance, SOL_MINT} from "../priceTools/utils";

export async function TRANSFER_TOKENS (
    args: {
        recipient: string;
        amount: number;
        tokenSymbol: string;
        priorityFee?: number;
    },
    keypair?: Keypair,
    user?: User
) {
    if (!user) throw new Error("User is required for TRANSFER_TOKENS");
    if (!keypair) throw new Error("Keypair is required for TRANSFER_TOKENS");

    const { recipient, amount, priorityFee = 0 } = args;
    let { tokenSymbol } = args;

    console.log(`[TRANSFER] ${amount} ${tokenSymbol} → ${recipient}`);

    const connection = new Connection(process.env.RPC_URL!);
    const recipientPk = new PublicKey(recipient);

    let isSol = tokenSymbol.trim().toUpperCase() === 'SOL';
    const isAddressLike = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenSymbol);

    const balance = await getBalances(user);

    if (!isAddressLike) {
        const tokens = findTokenInBalance(balance, tokenSymbol);
        if (tokens.length === 1) {
            tokenSymbol = tokens[0].address;
            if (tokenSymbol === SOL_MINT) isSol = true;
        } else if (tokens.length > 1) {
            return { resForAi: { status: "There are more than 1 token with such ticker", tokens } };
        } else if (!isSol) {
            return { resForAi: { status: `Error user dont have token ${tokenSymbol}` } };
        }
    } else {
        if (tokenSymbol === SOL_MINT) isSol = true;
    }

    const FEE_SOL = 0.0003;
    if (!enoughMoney(balance, amount, isSol ? SOL_MINT : tokenSymbol, FEE_SOL)) {
        return { resForAi: { status: `Error user dont have enough moaney` } };
    }

    let tx: Transaction;
    let tokenMeta: any = {};

    if (isSol) {
        // native sol transfer
        tokenMeta = {
            symbol: "SOL",
            address: SOL_MINT,
            logoURI: "https://res.coinpaper.com/coinpaper/solana_sol_logo_32f9962968.png",
        };

        tx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: recipientPk,
                lamports: Math.round(amount * LAMPORTS_PER_SOL),
            }),
        );
        addPriority(tx, priorityFee, 20_000);
    } else {
        const mintPk = new PublicKey(tokenSymbol);

        let decimals = 6;
        try {
            const info = await findSolanaToken(tokenSymbol, false);
            if (info && typeof info !== 'string') {
                tokenMeta = { symbol: info.symbol, address: info.address, logoURI: info.logoURI };
                decimals = info.decimals ?? 6;
            } else {
                tokenMeta = { symbol: tokenSymbol.slice(0, 4) + '...', address: tokenSymbol };
            }
        } catch {
            tokenMeta = { symbol: tokenSymbol.slice(0, 4) + '...', address: tokenSymbol };
        }

        const fromTA = await getOrCreateAssociatedTokenAccount(connection, keypair, mintPk, keypair.publicKey);
        const toTA   = await getOrCreateAssociatedTokenAccount(connection, keypair, mintPk, recipientPk);

        tx = new Transaction().add(
            createTransferInstruction(
                fromTA.address,
                toTA.address,
                keypair.publicKey,
                Math.round(amount * 10 ** decimals),
            ),
        );
        addPriority(tx, priorityFee, 40_000);
    }

    const sig = await connection.sendTransaction(tx, [keypair]);
    await connection.confirmTransaction(sig);

    return {
        resForAi:     { status: "success", transactionId: sig },
        resForStatus: { status: "success", transactionId: sig, to: recipient, amount, token: tokenMeta },
    };
}