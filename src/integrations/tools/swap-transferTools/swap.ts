import {Connection, Keypair, PublicKey, VersionedTransaction} from "@solana/web3.js";
import {User} from "@privy-io/server-auth";
import {getBalances} from "../../../services/mongoService";
import {enoughMoney} from "../../../utils/enoughMoney";
import fetch from "node-fetch";
import {Buffer} from "buffer";
import {buyTokenOnLaunchpad} from "../../../services/raydiumService";
import {findSolanaToken, findTokenInBalance} from "../priceTools/utils";

export async function SWAP (
    args: {
        from        : string;
        to          : string;
        amount      : string;
        priorityFee?: number;   // uLamports / CU
    },
    keypair?: Keypair,
    user?: User
) {
    if(!user) throw new Error("User is required for TRANSFER_TOKENS");
    if (!keypair) throw new Error("Keypair is required for SWAP");
    let {from, to}= args;
    const {  amount, priorityFee = 0 } = args;
    console.log(`swap from ${from} ${to} ${amount}`)
    const conn = new Connection(process.env.RPC_URL!);

    try {
        const balance = await getBalances(user);
        if(!from.match(/^.{32,44}$/)){
            const tokens = findTokenInBalance(balance, from);
            if(tokens.length > 1){
                return {resForAi:{ status: "There are more than 1 token with such ticker", tokens }}
            }
            if(tokens.length === 1){
                from = tokens[0].address;
            }else{
                return {resForAi:{ status: `Error user dont have token ${from}` }}
            }
        }

        if(!to.match(/^.{32,44}$/)){
            const tokens = findTokenInBalance(balance, to);
            if(tokens.length > 1){
                return {resForAi:{ status: "There are more than 1 token with such ticker", to }}
            }
            if(tokens.length === 1){
                to = tokens[0].address;
            }
        }

        const priorityFeeInSol = ((priorityFee || 0) / 1000000  / 1_000_000_000* 5000);
        const totalFee = 0.0002 + priorityFeeInSol;
        console.log(`[SWAP] Checking balance: amount=${amount}, from=${from}, totalFee=${totalFee} SOL (base: 0.0002 + priority: ${priorityFeeInSol})`);

        if(!enoughMoney(balance, parseFloat(amount), from, totalFee)){
            return {resForAi:{ status: `Error user dont have enough money. Need ${amount} ${from} + ${totalFee} SOL for fees` }}
        }

        // resolve tokens
        const inTok  = await findSolanaToken(from, false);
        const outTok = await findSolanaToken(to,   false);
        if (!inTok || !outTok) throw new Error("Token info missing");

        const lamports = Number((+amount * 10 ** inTok.decimals).toFixed(0));

        // Jupiter quote
        //console.log(`https://quote-api.jup.ag/v6/quote?inputMint=${inTok.address}&outputMint=${outTok.address}&amount=${lamports}&slippageBps=50&userPublicKey=${keypair.publicKey.toBase58()}`);
        const quoteURL = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inTok.address}&outputMint=${outTok.address}&amount=${lamports}&slippageBps=50&userPublicKey=${keypair.publicKey.toBase58()}`;
        const quote    = await (await fetch(quoteURL)).json();

        const swapResp = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({
                quoteResponse            : quote,
                userPublicKey            : keypair.publicKey.toBase58(),
                wrapAndUnwrapSol         : true,
                prioritizationFeeLamports: priorityFee,
            }),
        });
        console.log(`[PRIORITY] Jupiter fee = ${priorityFee} µLamports/CU`);

        const { swapTransaction } = await swapResp.json();
        if (!swapTransaction) throw new Error("Empty swap transaction");

        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
        tx.sign([keypair]);

        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        await conn.confirmTransaction(sig);

        return {
            resForAi: {
                status        : "success",
                transactionId : sig,
                details       : `Swapped ${amount} ${inTok.symbol} → ${outTok.symbol}`,
            },
            resForStatus: {
                status    : "success",
                id        : sig,
                amountFrom: quote.inAmount  / 10 ** inTok.decimals,
                from      : {
                    symbol  : inTok.symbol,
                    address : inTok.address,
                    logoURI : inTok.logoURI,
                },
                amountTo : quote.outAmount / 10 ** outTok.decimals,
                to:{
                    symbol : outTok.symbol,
                    address: outTok.address,
                    logoURI: outTok.logoURI,
                },
            },
        };
    } catch (error: any) {
        try{
            const res =await buyTokenOnLaunchpad({payerKeypair: keypair, mintPubkey: new PublicKey(to) ,amountInSol:Number(amount)});
            return {
                resForAi: {res},
                resForStatus: {res}
            }
        } catch (error: any) {
            console.log(error)
            return {resForAi:{ error: `Swap failed: ${error.message}` }
            };
        }
    }
}