import BN from 'bn.js';
import { Keypair, Connection, PublicKey, Transaction } from '@solana/web3.js';
import { KaminoMarket, KaminoAction, VanillaObligation, DEFAULT_RECENT_SLOT_DURATION_MS } from '@kamino-finance/klend-sdk';
import { CliConnectionPool } from '@kamino-finance/klend-sdk/dist/client/tx/CliConnectionPool';
import { sendAndConfirmTx } from '@kamino-finance/klend-sdk/dist/client/tx/tx';
import type { Chain } from '@kamino-finance/klend-sdk/dist/client/tx/rpc';
import { address as toAddress, Address } from '@solana/kit';
import { createKeyPairSignerFromBytes } from '@solana/signers';
import { KAMINO_PROGRAM_ID, KAMINO_MAIN_MARKET, RPC_URL, COMMITMENT, DEFAULT_CLUSTER } from './constants';
import { KaminoDepositParams, KaminoWithdrawParams, KaminoBorrowParams, KaminoRepayParams } from './types';
import { addPriority } from '../../utils/priority';
import { resolveTokenMint } from './tokens';

const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112' as Address;
const LAMPORTS_PER_SOL = 1_000_000_000;

function toBaseUnits(amountUi: number, decimals: number): BN {
    const base = 10 ** decimals;
    return new BN(Math.floor(amountUi * base));
}

function buildChain(): Chain {
    const wsUrl = process.env.RPC_WS_URL || RPC_URL.replace('https://', 'wss://');
    return {
        name: DEFAULT_CLUSTER as any,
        endpoint: { url: RPC_URL, name: 'primary' },
        wsEndpoint: { url: wsUrl, name: 'primary-ws' },
        multicastEndpoints: []
    } as Chain;
}

async function sendAndConfirmTxWithPriority(
    connectionPool: CliConnectionPool,
    signer: any,
    instructions: any[],
    priorityFee: number = 0,
    ownerKeypair?: Keypair
): Promise<string> {
    console.log(`[KAMINO TX] sendAndConfirmTxWithPriority called with priorityFee: ${priorityFee}`);
    console.log(`[KAMINO TX] Instructions count: ${instructions.length}`);

    if (priorityFee === 0) {
        console.log(`[KAMINO TX] Using standard Kamino SDK (no priority fee)`);
        return (await sendAndConfirmTx(connectionPool, signer, instructions)) as unknown as string;
    }

    try {
        console.log(`[KAMINO TX] Attempting fallback approach with Legacy Transaction`);
        const connection = connectionPool.legacyConnection;
        const tx = new Transaction();

        addPriority(tx, priorityFee, 300_000);
        console.log(`[KAMINO TX] Added priority fee to legacy transaction`);
        console.log(`[KAMINO TX] Converting Kamino instructions to legacy format`);

        const keypairToUse = ownerKeypair || Keypair.fromSecretKey(signer.secretKey);

        for (let i = 0; i < instructions.length; i++) {
            const kaminoIx = instructions[i];
            console.log(`[KAMINO TX] Processing instruction ${i + 1}/${instructions.length}`);
            try {
                tx.add(kaminoIx);
            } catch (conversionError) {
                console.warn(`[KAMINO TX] Could not convert instruction ${i + 1}, skipping:`, conversionError);
                continue;
            }
        }

        console.log(`[KAMINO TX] Legacy transaction has ${tx.instructions.length} instructions total`);

        const { blockhash } = await connection.getLatestBlockhash(COMMITMENT);
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypairToUse.publicKey;

        console.log(`[KAMINO TX] Signing and sending legacy transaction`);
        tx.sign(keypairToUse);

        const signature = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
            preflightCommitment: COMMITMENT
        });

        console.log(`[KAMINO TX] Transaction sent with signature: ${signature}`);
        await connection.confirmTransaction(signature, COMMITMENT);
        console.log(`[KAMINO TX] Transaction confirmed successfully`);
        return signature;
    } catch (error: any) {
        console.error(`[KAMINO TX ERROR] Failed to send transaction:`, error);
        console.error(`[KAMINO TX ERROR] Error message:`, error?.message);
        console.error(`[KAMINO TX ERROR] Error logs:`, error?.logs);
        console.error(`[KAMINO TX ERROR] Full error:`, JSON.stringify(error, null, 2));
        throw error;
    }
}

async function loadMarket(rpc: any): Promise<KaminoMarket> {
    const market = await KaminoMarket.load(rpc, toAddress(KAMINO_MAIN_MARKET), DEFAULT_RECENT_SLOT_DURATION_MS, toAddress(KAMINO_PROGRAM_ID));
    if (!market) throw new Error('Kamino market not found');
    await market.loadReserves();
    return market;
}

async function resolveMintAddress(kaminoMarket: KaminoMarket, token: string): Promise<Address> {
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)) return toAddress(token);
    const mint = await resolveTokenMint(token);
    if (mint) return toAddress(mint);
    const reserve = kaminoMarket.getReserveBySymbol(token.toUpperCase());
    if (!reserve) throw new Error(`Reserve not found for token: ${token}`);
    return reserve.getLiquidityMint();
}

async function ensureSolBalanceForDeposit(legacyConnection: Connection, owner: PublicKey, amountBase: BN, isSolDeposit: boolean) {
    const lamports = await legacyConnection.getBalance(owner, COMMITMENT);
    const feeBuffer = 0.01 * LAMPORTS_PER_SOL;
    const required = isSolDeposit ? Number(amountBase.toString()) + feeBuffer : feeBuffer;
    const needSol = required / LAMPORTS_PER_SOL;
    const haveSol = lamports / LAMPORTS_PER_SOL;

    console.log(`[KAMINO BALANCE CHECK] SOL deposit: ${isSolDeposit}`);
    console.log(`[KAMINO BALANCE CHECK] Required: ${needSol.toFixed(6)} SOL`);
    console.log(`[KAMINO BALANCE CHECK] Available: ${haveSol.toFixed(6)} SOL`);

    if (lamports < required) {
        const missingSol = Math.max(0, needSol - haveSol);
        throw new Error(
            `INSUFFICIENT_SOL: not enough SOL for rent/fees${isSolDeposit ? ' and SOL deposit wrap' : ''}. Required ~${needSol.toFixed(
                6
            )} SOL, balance ${haveSol.toFixed(6)} SOL. Top up ~${missingSol.toFixed(6)} SOL or reduce amount.`
        );
    }

    console.log(`[KAMINO BALANCE CHECK] ✅ Balance check passed`);
}

export async function kaminoDeposit(ownerKeypair: Keypair, params: KaminoDepositParams): Promise<string> {
    const { token, amount, priorityFee = 0 } = params;
    console.log(`[KAMINO DEPOSIT] Starting deposit: ${amount} ${token}, priorityFee: ${priorityFee}`);
    console.log(`[KAMINO DEPOSIT] Owner: ${ownerKeypair.publicKey.toBase58()}`);

    try {
        console.log(`[KAMINO DEPOSIT] Building chain connection`);
        const chain = buildChain();
        const c = new CliConnectionPool(chain);
        const rpc = c.rpc;

        console.log(`[KAMINO DEPOSIT] Loading Kamino market`);
        const kaminoMarket = await loadMarket(rpc);

        console.log(`[KAMINO DEPOSIT] Resolving mint address for token: ${token}`);
        const mint = await resolveMintAddress(kaminoMarket, token);
        console.log(`[KAMINO DEPOSIT] Mint address: ${mint}`);

        console.log(`[KAMINO DEPOSIT] Getting reserve for mint`);
        const reserve = kaminoMarket.getReserveByMint(mint);
        if (!reserve) {
            console.error(`[KAMINO DEPOSIT ERROR] Reserve not found for mint: ${mint}`);
            throw new Error(`Reserve not found for mint: ${mint}`);
        }

        console.log(`[KAMINO DEPOSIT] Getting decimals`);
        const decimals = reserve.getMintDecimals();
        console.log(`[KAMINO DEPOSIT] Token decimals: ${decimals}`);

        console.log(`[KAMINO DEPOSIT] Converting amount to base units`);
        const amountBase = toBaseUnits(amount, decimals);
        console.log(`[KAMINO DEPOSIT] Amount in base units: ${amountBase.toString()}`);

        const isSolDeposit = mint === NATIVE_SOL_MINT;
        console.log(`[KAMINO DEPOSIT] Is SOL deposit: ${isSolDeposit}`);

        console.log(`[KAMINO DEPOSIT] Checking SOL balance`);
        await ensureSolBalanceForDeposit(c.legacyConnection, ownerKeypair.publicKey, amountBase, isSolDeposit);
        console.log(`[KAMINO DEPOSIT] SOL balance check passed`);

        console.log(`[KAMINO DEPOSIT] Creating signer`);
        const signer = await createKeyPairSignerFromBytes(new Uint8Array(ownerKeypair.secretKey));

        console.log(`[KAMINO DEPOSIT] Creating obligation`);
        const obligation = new VanillaObligation(toAddress(KAMINO_PROGRAM_ID));

        console.log(`[KAMINO DEPOSIT] Building deposit transaction with priorityFee in Kamino config`);
        const kaminoConfig = {
            skipInitialization: false,
            skipLutCreation: true,
            computeUnitLimit: 300_000,
            computeUnitPrice: priorityFee > 0 ? priorityFee : undefined
        };

        console.log(`[KAMINO DEPOSIT] Kamino config:`, kaminoConfig);

        const action = await KaminoAction.buildDepositTxns(
            kaminoMarket,
            amountBase,
            mint,
            signer,
            obligation,
            true,
            undefined,
            0,
            true,
            false,
            kaminoConfig,
            undefined,
            undefined,
            undefined
        );
        console.log(`[KAMINO DEPOSIT] Transaction built successfully`);

        const instructions = KaminoAction.actionToIxs(action);
        console.log(`[KAMINO DEPOSIT] Action converted to ${instructions.length} instructions`);
        console.log(`[KAMINO DEPOSIT] Sending transaction via standard Kamino SDK`);
        console.log(`[KAMINO DEPOSIT] Priority fee should be handled by Kamino config: ${priorityFee} µLamports`);

        const sig = await sendAndConfirmTx(c, signer, instructions);
        console.log(`[KAMINO DEPOSIT] Transaction successful with signature: ${sig}`);
        return sig as unknown as string;
    } catch (e: any) {
        console.error(`[KAMINO DEPOSIT ERROR] Deposit failed:`, e);
        console.error(`[KAMINO DEPOSIT ERROR] Error message:`, e?.message);
        console.error(`[KAMINO DEPOSIT ERROR] Error logs:`, e?.logs);
        console.error(`[KAMINO DEPOSIT ERROR] Full error:`, JSON.stringify(e, null, 2));

        const message = String(e?.message || e);
        if (message.includes('insufficient lamports') || message.includes('custom program error: #1')) {
            throw new Error('INSUFFICIENT_SOL: Not enough SOL to cover rent/fees. Top up wallet (~0.1 SOL) or reduce deposit amount and retry.');
        }
        throw e;
    }
}

export async function kaminoWithdraw(ownerKeypair: Keypair, params: KaminoWithdrawParams): Promise<string> {
    const { token, amount, priorityFee = 0 } = params;
    const chain = buildChain();
    const c = new CliConnectionPool(chain);
    const rpc = c.rpc;

    const kaminoMarket = await loadMarket(rpc);
    const mint = await resolveMintAddress(kaminoMarket, token);
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (!reserve) throw new Error(`Reserve not found for mint: ${mint}`);
    const decimals = reserve.getMintDecimals();
    const amountBase = toBaseUnits(amount, decimals);

    const signer = await createKeyPairSignerFromBytes(new Uint8Array(ownerKeypair.secretKey));
    const obligation = new VanillaObligation(toAddress(KAMINO_PROGRAM_ID));

    const action = await KaminoAction.buildWithdrawTxns(
        kaminoMarket,
        amountBase,
        mint,
        signer,
        obligation,
        true,
        undefined,
        0,
        true,
        false,
        { skipInitialization: false, skipLutCreation: true },
        undefined,
        undefined,
        undefined,
        undefined
    );

    try {
        console.log(`[KAMINO WITHDRAW] Using priority fee: ${priorityFee} µLamports`);
        const sig = await sendAndConfirmTxWithPriority(c, signer, KaminoAction.actionToIxs(action), priorityFee, ownerKeypair);
        return sig as unknown as string;
    } catch (e: any) {
        const message = String(e?.message || e);
        if (message.includes('insufficient lamports') || message.includes('custom program error: #1')) {
            throw new Error('INSUFFICIENT_SOL: Not enough SOL to cover rent/fees. Top up wallet and retry.');
        }
        throw e;
    }
}

export async function kaminoBorrow(ownerKeypair: Keypair, params: KaminoBorrowParams): Promise<string> {
    const { token, amount, priorityFee = 0 } = params;
    const chain = buildChain();
    const c = new CliConnectionPool(chain);
    const rpc = c.rpc;

    const kaminoMarket = await loadMarket(rpc);
    const mint = await resolveMintAddress(kaminoMarket, token);
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (!reserve) throw new Error(`Reserve not found for mint: ${mint}`);
    const decimals = reserve.getMintDecimals();
    const amountBase = toBaseUnits(amount, decimals);

    const signer = await createKeyPairSignerFromBytes(new Uint8Array(ownerKeypair.secretKey));
    const obligation = new VanillaObligation(toAddress(KAMINO_PROGRAM_ID));

    const action = await KaminoAction.buildBorrowTxns(
        kaminoMarket,
        amountBase,
        mint,
        signer,
        obligation,
        true,
        undefined,
        0,
        true,
        false,
        { skipInitialization: false, skipLutCreation: true },
        undefined,
        undefined
    );

    console.log(`[KAMINO BORROW] Using priority fee: ${priorityFee} µLamports`);
    const sig = await sendAndConfirmTxWithPriority(c, signer, KaminoAction.actionToIxs(action), priorityFee, ownerKeypair);
    return sig as unknown as string;
}

export async function kaminoRepay(ownerKeypair: Keypair, params: KaminoRepayParams): Promise<string> {
    const { token, amount, priorityFee = 0 } = params;
    const chain = buildChain();
    const c = new CliConnectionPool(chain);
    const rpc = c.rpc;

    const kaminoMarket = await loadMarket(rpc);
    const mint = await resolveMintAddress(kaminoMarket, token);
    const reserve = kaminoMarket.getReserveByMint(mint);
    if (!reserve) throw new Error(`Reserve not found for mint: ${mint}`);
    const decimals = reserve.getMintDecimals();
    const amountBase = toBaseUnits(amount, decimals);

    const signer = await createKeyPairSignerFromBytes(new Uint8Array(ownerKeypair.secretKey));
    const obligation = new VanillaObligation(toAddress(KAMINO_PROGRAM_ID));

    const currentSlot = await (async () => {
        const info = await c.rpc.getSlot().send();
        return BigInt(info);
    })();

    const action = await KaminoAction.buildRepayTxns(
        kaminoMarket,
        amountBase,
        mint,
        signer,
        obligation,
        true,
        undefined,
        currentSlot,
        undefined,
        0,
        true,
        false,
        { skipInitialization: false, skipLutCreation: true },
        undefined
    );

    console.log(`[KAMINO REPAY] Using priority fee: ${priorityFee} µLamports`);
    const sig = await sendAndConfirmTxWithPriority(c, signer, KaminoAction.actionToIxs(action), priorityFee, ownerKeypair);
    return sig as unknown as string;
}

export async function kaminoHealth(user: string): Promise<{
    ltv: number;
    liquidationLtv: number;
    borrowLimitUsd: number;
    netAccountValueUsd: number;
}> {
    const chain = buildChain();
    const c = new CliConnectionPool(chain);
    const rpc = c.rpc;
    const kaminoMarket = await loadMarket(rpc);
    const userAddr = toAddress(user);
    const obl = await kaminoMarket.getUserVanillaObligation(userAddr);
    if (!obl) return { ltv: 0, liquidationLtv: 0, borrowLimitUsd: 0, netAccountValueUsd: 0 };
    const s = obl.refreshedStats;
    return {
        ltv: Number(s.loanToValue),
        liquidationLtv: Number(s.liquidationLtv),
        borrowLimitUsd: Number(s.borrowLimit),
        netAccountValueUsd: Number(s.netAccountValue)
    };
}