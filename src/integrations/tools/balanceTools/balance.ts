import {Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction} from "@solana/web3.js";
import {User} from "@privy-io/server-auth";
import {createLogger, timer} from "../../../utils/logger";
import {getTokenMetadataFast} from "./utils";
import {setBalance} from "../../../services/mongoService";

export async function GET_BALANCE (_args: any, keypair?: Keypair, user?:User) {
    if(!user) throw new Error("User is required for GET_BALANCE");
    if (!keypair) throw new Error("Keypair is required for GET_BALANCE");

    const log = createLogger("BALANCE");
    log.info(`Start for ${keypair.publicKey.toBase58().slice(0,4)}…`);

    const connection = new Connection(process.env.RPC_URL!);

    const tSol = timer("getBalance", log);
    const solBalance = (await connection.getBalance(keypair.publicKey)) / 1e9;
    tSol.end({ sol: +solBalance.toFixed(6) });

    const tTok = timer("getParsedTokenAccountsByOwner", log);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        keypair.publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );
    tTok.end({ accounts: tokenAccounts.value.length });

    const balances: any[] = [{
        symbol : 'SOL',
        address: 'So11111111111111111111111111111111111111112',
        name   : 'Solana',
        logoURI: 'https://res.coinpaper.com/coinpaper/solana_sol_logo_32f9962968.png',
        balance: solBalance,
        decimals: 9,
    }];

    for (const { account } of tokenAccounts.value) {
        const info = account.data.parsed.info;
        const mint = info.mint as string;
        const amt  = info.tokenAmount.uiAmount as number;
        const decs = info.tokenAmount.decimals as number;
        if (amt > 0) balances.push({ address: mint, balance: amt, decimals: decs });
    }

    log.info(`Non-zero SPL tokens: ${Math.max(0, balances.length - 1)}`);

    const tMeta = timer("metadataEnrich", log);
    await Promise.all(balances.map(async (b, i) => {
        if (i === 0) return;
        const meta = await getTokenMetadataFast(b.address);
        Object.assign(b, { symbol: meta.symbol, name: meta.name, logoURI: meta.logoURI });
    }));
    tMeta.end();

    const preview = balances.slice(0, 6).map(b => `${b.symbol || b.address.slice(0,4)}:${(b.balance).toFixed(4)}`).join(", ");
    log.info(`Preview: ${preview}${balances.length > 6 ? ", …" : ""}`);

    await setBalance(user, balances);
    log.info("Saved to Mongo");
    return { resForAi: { balances } };
}