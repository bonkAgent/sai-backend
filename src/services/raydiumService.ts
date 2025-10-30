import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
  Signer,
  
} from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import crypto from "crypto";
import BN from "bn.js";
import {TOKEN_DECIMAL, SOL_DECIMAL, WSOL_TOKEN, TOKEN_PROGRAM, ASSOC_TOKEN_ACC_PROG, UNIT_BUDGET, UNIT_PRICE ,METAPLEX_PROGRAM, RENT,
  RAYDIUM_LAUNCHPAD_PROGRAM, RAYDIUM_AUTHORITY, GLOBAL_CONFIG, PLATFORM_CONFIG, EVENT_AUTHORITY,
  LAUNCHPAD_POOL_SEED, LAUNCHPAD_POOL_VAULT_SEED} from "../types/bonkServiceSettings";
const connection = new Connection(process.env.RPC_URL!);

export async function setupTransaction(payerPubkey: PublicKey): Promise<Transaction> {
  const { blockhash } = await connection.getLatestBlockhash();

  const txn = new Transaction({
    recentBlockhash: blockhash,
    feePayer: payerPubkey,
  });

  // Установить цену за compute unit (в микролампортах)
  txn.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: UNIT_PRICE,
    })
  );

  // Установить лимит compute units
  txn.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: UNIT_BUDGET,
    })
  );

  return txn;
}

export async function derivePDAs(mint: PublicKey): Promise<{
        poolState: PublicKey;
        baseVault: PublicKey;
        quoteVault: PublicKey;
        metadata: PublicKey;
    }> {
    const [poolState] = await PublicKey.findProgramAddress(
        [LAUNCHPAD_POOL_SEED, mint.toBuffer(), WSOL_TOKEN.toBuffer()],
        RAYDIUM_LAUNCHPAD_PROGRAM
    );

    const [baseVault] = await PublicKey.findProgramAddress(
        [LAUNCHPAD_POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
        RAYDIUM_LAUNCHPAD_PROGRAM
    );

    const [quoteVault] = await PublicKey.findProgramAddress(
        [LAUNCHPAD_POOL_VAULT_SEED, poolState.toBuffer(), WSOL_TOKEN.toBuffer()],
        RAYDIUM_LAUNCHPAD_PROGRAM
    );

    const [metadata] = await PublicKey.findProgramAddress(
        [Buffer.from("metadata"), METAPLEX_PROGRAM.toBuffer(), mint.toBuffer()],
        METAPLEX_PROGRAM
    );
    return { poolState, baseVault, quoteVault, metadata };
}

function encodeString(str: string): Buffer {
  const bytes = Buffer.from(str, "utf8");
  const buf = Buffer.alloc(4 + bytes.length);
  buf.writeUInt32LE(bytes.length, 0);
  bytes.copy(buf, 4);
  return buf;
}

export function createLaunchInstruction({
  mintKeypair,
  payer,
  pdas,
  name,
  symbol,
  uri,
  decimals,
  supply,
  baseSell,
  quoteRaising
}: {
  mintKeypair: Keypair,
  payer: Keypair,
  pdas: {
    poolState: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    metadata: PublicKey;
  };
  name: string;
  symbol: string;
  uri: string;
  decimals?: number;
  supply?: string;
  baseSell?: string;
  quoteRaising?: string;
}): TransactionInstruction {
  const u8 = (n: number) => Buffer.from([n & 0xff]);
  const u64le = (bnStr: string | number) =>
    new BN(bnStr).toArrayLike(Buffer, "le", 8);

  // anchor discriminator: sha256("global:initialize_v2")[:8]
  const discrInitializeV2 = crypto
    .createHash("sha256")
    .update("global:initialize_v2")
    .digest()
    .subarray(0, 8);

  // base_mint_param
  const baseMintParam = Buffer.concat([
    u8(decimals!),          // u8
    encodeString(name),     // string (u32le + bytes)
    encodeString(symbol),   // string
    encodeString(uri),      // string
  ]);

   const curveParam = Buffer.concat([
    u8(0),                   // Constant
    u64le(supply!),          // total supply (u64 LE)
    u64le(baseSell!),        // base sell (u64 LE)
    u64le(quoteRaising!),    // quote raising (u64 LE, в лампортах)
    u64le(1),                // <---- 4-е поле, заполняем 0 (placeholder)
  ]);

  const vestingParam = Buffer.concat([
    u64le(0), // total_locked_amount
    u64le(0), // cliff_period
    u64le(0), // unlock_period
  ]);

  const ammFeeOn = Buffer.from([1]);

  const data = Buffer.concat([
    discrInitializeV2,
    baseMintParam,
    curveParam,
    vestingParam,
    ammFeeOn,
  ]);

  const keys = [
    { pubkey: payer.publicKey,           isSigner: true,  isWritable: true  }, // Payer
    { pubkey: payer.publicKey,           isSigner: true,  isWritable: true  }, // Creator
    { pubkey: GLOBAL_CONFIG,             isSigner: false, isWritable: false },
    { pubkey: PLATFORM_CONFIG,           isSigner: false, isWritable: false },
    { pubkey: RAYDIUM_AUTHORITY,         isSigner: false, isWritable: false },
    { pubkey: pdas.poolState,            isSigner: false, isWritable: true  },
    { pubkey: mintKeypair.publicKey,     isSigner: true,  isWritable: true  },
    { pubkey: WSOL_TOKEN,                isSigner: false, isWritable: false },
    { pubkey: pdas.baseVault,            isSigner: false, isWritable: true  },
    { pubkey: pdas.quoteVault,           isSigner: false, isWritable: true  },
    { pubkey: pdas.metadata,             isSigner: false, isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,          isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID,          isSigner: false, isWritable: false }, // оставил как у тебя
    { pubkey: METAPLEX_PROGRAM,          isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId,   isSigner: false, isWritable: false },
    { pubkey: RENT,                      isSigner: false, isWritable: false },
    { pubkey: EVENT_AUTHORITY,           isSigner: false, isWritable: false },
    { pubkey: RAYDIUM_LAUNCHPAD_PROGRAM, isSigner: false, isWritable: false },
  ];
  
  return new TransactionInstruction({ keys, programId: RAYDIUM_LAUNCHPAD_PROGRAM, data });
}

export function createBuyInstruction({
    payer,
    poolState,
    baseVault,
    quoteVault,
    baseMint,
    baseTokenAccount,
    wsolTokenAccount,
    amountInSol,
    minAmountOutTokens,
    shareFeeRate = 0
}: {
    payer: PublicKey;
    poolState: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    baseMint: PublicKey;
    baseTokenAccount: PublicKey;
    wsolTokenAccount: PublicKey;
    amountInSol: number;
    minAmountOutTokens: number;
    shareFeeRate?: number;
}): TransactionInstruction {
    const data = Buffer.concat([
        Buffer.from("faea0d7bd59c13ec", "hex"),
        new BN(amountInSol * 10 ** SOL_DECIMAL).toArrayLike(Buffer, "le", 8),
        new BN(minAmountOutTokens * 10 ** TOKEN_DECIMAL).toArrayLike(Buffer, "le", 8),
        new BN(shareFeeRate).toArrayLike(Buffer, "le", 8)
    ]);

    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: RAYDIUM_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: GLOBAL_CONFIG, isSigner: false, isWritable: false },
        { pubkey: PLATFORM_CONFIG, isSigner: false, isWritable: false },
        { pubkey: poolState, isSigner: false, isWritable: true },
        { pubkey: baseTokenAccount, isSigner: false, isWritable: true },
        { pubkey: wsolTokenAccount, isSigner: false, isWritable: true },
        { pubkey: baseVault, isSigner: false, isWritable: true },
        { pubkey: quoteVault, isSigner: false, isWritable: true },
        { pubkey: baseMint, isSigner: false, isWritable: true },
        { pubkey: WSOL_TOKEN, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: RAYDIUM_LAUNCHPAD_PROGRAM, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
        keys,
        programId: RAYDIUM_LAUNCHPAD_PROGRAM,
        data
    });
}

export async function createToken(
  payerKeypair: Keypair,
  mintKeypair: Keypair,
  name: string,
  symbol: string,
  uri: string,
  decimals: number,
  supply: string,       // 1 quadrillion (1e15) todo
  baseSell: string,      // 80% of supply todo
  quoteRaising: string 
): Promise<[Transaction, PublicKey]> {
  const payerPubkey = payerKeypair.publicKey;
  const mintPubkey = mintKeypair.publicKey;

  const txn = await setupTransaction(payerPubkey);
  const pdas = await derivePDAs(mintPubkey);
  
  const launchIx: TransactionInstruction = createLaunchInstruction({
    mintKeypair,
    payer: payerKeypair,
    pdas,
    name,
    symbol,
    uri,
    decimals,
    supply,
    baseSell,
    quoteRaising,
  });
  txn.add(launchIx);

  const ata = await getAssociatedTokenAddress(
    mintPubkey,
    payerPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOC_TOKEN_ACC_PROG
  );

  const ataIx = createAssociatedTokenAccountInstruction(
    payerPubkey,  // from (payer)
    ata,          // associated token address
    payerPubkey,  // owner
    mintPubkey,   // mint
    TOKEN_PROGRAM_ID,
    ASSOC_TOKEN_ACC_PROG
  );

  txn.add(ataIx);

  return [txn, ata];
}

export async function createBuyTx(
  payerKeypair: Keypair,
  mintPubkey: PublicKey,
  baseTokenAccount: PublicKey,
  amountIn: number,
  minimumAmountOut: number
): Promise<[Transaction, Keypair[]]> {
  const txn = await setupTransaction(payerKeypair.publicKey);
  const additionalSigners: Keypair[] = [];

  // 1. Создание временного WSOL-аккаунта
  const {
    wsolTokenAccount,
    instructions: wsolInstructions,
    wsolKeypair,
  } = await createTemporaryWsolAccount(payerKeypair.publicKey, amountIn);
  additionalSigners.push(wsolKeypair);

  wsolInstructions.forEach((ix) => txn.add(ix));

  // 2. Вычисление PDA
  const pdas = await derivePDAs(mintPubkey);

  // 3. Инструкция покупки
  const buyIx = createBuyInstruction({
    payer: payerKeypair.publicKey,
    poolState: pdas.poolState,
    baseVault: pdas.baseVault,
    quoteVault: pdas.quoteVault,
    baseMint: mintPubkey,
    baseTokenAccount,
    wsolTokenAccount,
    amountInSol: amountIn,
    minAmountOutTokens: minimumAmountOut,
  });
  txn.add(buyIx);

  // 4. Закрытие WSOL-аккаунта после покупки
  const closeWsolIx = await getCloseWsolInstruction(
    wsolTokenAccount,
    payerKeypair.publicKey
  );
  txn.add(closeWsolIx);

  return [txn, additionalSigners];
}

export async function launchTokenWithBuy(
  payerKeypair: Keypair,
  mintKeypair: Keypair,
  name: string,
  symbol: string,
  uri: string,
  amountToBuy: number,
  readableSupply: number = 1_000_000_000,       // 1 quadrillion (1e15) todo
  readableQuote: number = 85,
): Promise<Record<string, any>> {
  const results: Record<string, any> = {
    mint_keypair: mintKeypair,
    token_tx_signature: null,
    base_token_account: null,
    pdas: {},
    buy_tx_signature: null,
    error: null,
  };

  const decimals = 6
  const supply = (readableSupply * 10 ** decimals).toString();        // "10000000000000"
  const baseSell = (readableSupply * 0.8 * 10 ** decimals).toString(); // "8000000000000"
  const quoteRaising = (readableQuote * 10 ** 9).toString();           // "30000000000"

  try {
    console.log("Creating token and combining with buy...");

    const payer = payerKeypair.publicKey;
    const mint = mintKeypair.publicKey;
    const pdas = await derivePDAs(mint);
    results.pdas = pdas;

    // 1. Launch instruction
    const launchIx = createLaunchInstruction({
      mintKeypair,
      payer: payerKeypair,
      pdas,
      name,
      symbol,
      uri,
      decimals,
      supply,
      baseSell,
      quoteRaising,
    });

    // 2. Create ATA
    const ata = await getAssociatedTokenAddress(
      mint,
      payer,
      false,
      TOKEN_PROGRAM_ID,
      ASSOC_TOKEN_ACC_PROG
    );

    results.base_token_account = ata;

    const ataIx = createAssociatedTokenAccountInstruction(
      payer,
      ata,
      payer,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOC_TOKEN_ACC_PROG
    );

    // 3. Create WSOL temp account
    const amountInSol = amountToBuy;
    const expectedTokens = ((parseInt(baseSell) / 10 ** TOKEN_DECIMAL)/ readableQuote) * amountInSol;

    const {
      wsolTokenAccount,
      instructions: wsolIxs,
      wsolKeypair,
    } = await createTemporaryWsolAccount(payer, amountInSol);

    // 4. Buy instruction
    const buyIx = createBuyInstruction({
      payer,
      poolState: pdas.poolState,
      baseVault: pdas.baseVault,
      quoteVault: pdas.quoteVault,
      baseMint: mint,
      baseTokenAccount: ata,
      wsolTokenAccount,
      amountInSol,
      minAmountOutTokens: expectedTokens,
    });

    // 5. Close WSOL
    const closeIx = await getCloseWsolInstruction(wsolTokenAccount, payer);

    // 6. Assemble full transaction
    const tx = new Transaction();
    tx.add(launchIx, ataIx, ...wsolIxs, buyIx, closeIx);

    const signers = [payerKeypair, mintKeypair, wsolKeypair];

    const result = await sendAndConfirmTransaction(tx, signers, {
      skipPreflight: true,
      confirm: true,
      maxRetries: 3,
    });

    if (result.error) {
      results.error = result.error;
    } else {
      results.token_tx_signature = result;
      results.buy_tx_signature = result;
    }

    return results;
  } catch (e: any) {
    const errorMsg = `launchTokenWithBuyCombined error: ${e.message || e.stack}`;
    console.error(errorMsg);
    results.error = errorMsg;
    return results;
  }
}

export async function launchToken(
  payerKeypair: Keypair,
  mintKeypair: Keypair,
  name: string,
  symbol: string,
  uri: string,
  readableSupply: number = 1_000_000_000,       // 1 quadrillion (1e15) todo
  readableQuote: number = 85
): Promise<Record<string, any>> {
    const results: Record<string, any> = {
        mint_keypair: mintKeypair,
        token_tx_signature: null,
        base_token_account: null,
        pdas: {},
        error: null,
    };
    const decimals = 6
    const supply = (readableSupply * 10 ** decimals).toString();        // "10000000000000"
    const baseSell = (readableSupply * 0.8 * 10 ** decimals).toString(); // "8000000000000"
    const quoteRaising = (readableQuote * 10 ** 9).toString();           // "30000000000"

    try {
        console.log("Creating token with config:");
        console.log(`Name: ${name}\nSymbol: ${symbol}\nURI: ${uri}\nDecimals: ${decimals}`);

        console.log("\n===== STEP 1: Creating Token =====");

        const [createTokenTxn, baseTokenAccount] = await createToken(
            payerKeypair,
            mintKeypair,
            name,
            symbol,
            uri,
            decimals,
            supply,
            baseSell,
            quoteRaising
        );

        const pdas = await derivePDAs(mintKeypair.publicKey);
        results.pdas = pdas;
        results.base_token_account = baseTokenAccount;
        const tokenSuccess = await sendAndConfirmTransaction(createTokenTxn, [payerKeypair, mintKeypair], {
            skipPreflight: true,
            confirm: true,
            maxRetries: 3,
        });

        if (tokenSuccess.error) {
            console.error("Token creation failed.");
            results.error = tokenSuccess.error;
            return results;
        }

        console.log("Token creation succeeded!");
        results.token_tx_signature = tokenSuccess;
        return results;
    } catch (e: any) {
        const errorMsg = `Error in launchTokenWithBuy: ${e.stack || e.message}`;
        console.error(errorMsg);
        results.error = errorMsg;
        return results;
    }
}

export async function createTemporaryWsolAccount(
  payerPubkey: PublicKey,
  amountSol: number
): Promise<{
  wsolTokenAccount: PublicKey;
  instructions: TransactionInstruction[];
  wsolKeypair: Keypair;
}> {
  const wsolKeypair = Keypair.generate();
  const wsolTokenAccount = wsolKeypair.publicKey;

  const rentExemption = await connection.getMinimumBalanceForRentExemption(165);

  const lamports = rentExemption + Math.floor(amountSol * 10 ** 9);

  const instructions: TransactionInstruction[] = [];

  // Create WSOL account
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payerPubkey,
      newAccountPubkey: wsolTokenAccount,
      lamports,
      space: 165,
      programId: TOKEN_PROGRAM_ID,
    })
  );

  // Initialize WSOL account
  instructions.push(
    createInitializeAccountInstruction(
      wsolTokenAccount,
      WSOL_TOKEN,
      payerPubkey,
      TOKEN_PROGRAM_ID
    )
  );

  return {wsolTokenAccount, instructions, wsolKeypair}
}

export function getCloseWsolInstruction(
  wsolTokenAccount: PublicKey,
  owner: PublicKey
): TransactionInstruction {
  return createCloseAccountInstruction(
    wsolTokenAccount,
    owner,       // destination (receive recovered SOL)
    owner,       // owner
    [],          // multisigSigners
    TOKEN_PROGRAM_ID
  );
}

export async function sendAndConfirmTransaction(
  tx: Transaction,
  signers: Signer[],
  opts: {skipPreflight?: boolean, confirm?: boolean, maxRetries?: number; priorityMicroLamports?: number } = {}
): Promise<any> {
  const { maxRetries = 3 } = opts;

  // 1) свежий blockhash + feePayer обязательно проставлять ДО подписи
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  if (!tx.feePayer) return {error: 'feePayer not set'};
  tx.recentBlockhash = blockhash;

  // 2) симуляция — печатаем логи, чтобы не слепо ловить таймаут
  const sim = await connection.simulateTransaction(tx, signers);
  if (sim.value.err) {
    console.error('Simulation error:', sim.value.err);
    if (sim.value.logs) console.error('Program logs:', sim.value.logs.join('\n'));
    return {error: 'Preflight simulation failed'};
  }

  // 3) подписываем и шлём
  tx.partialSign(...(signers as Keypair[])); // если есть не-локальные подписанты — здесь используйте wallet.signTransaction
  const raw = tx.serialize();

  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries,
  });

  // 4) корректное подтверждение по (signature, blockhash, lastValidBlockHeight)
  const conf = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed'
  );

  if (conf.value.err) {
    console.error('Confirmation error:', conf.value.err);
    return {error: `Transaction failed: ${sig}`};
  }

  return sig;
}
export async function getRaydiumTokenPrice(mint: PublicKey): Promise<number> {
  const pdas = await derivePDAs(mint); // ← ты уже используешь это

  const baseVault = pdas.baseVault;
  const quoteVault = pdas.quoteVault;

  // Считываем балансы из vault аккаунтов
  const baseTokenAccount = await getAccount(connection, baseVault, undefined, TOKEN_PROGRAM_ID);
  const quoteTokenAccount = await getAccount(connection, quoteVault, undefined, TOKEN_PROGRAM_ID);

  const baseAmount = BigInt(baseTokenAccount.amount.toString());
  const quoteAmount = BigInt(quoteTokenAccount.amount.toString());

  if (baseAmount === 0n) throw new Error("Base vault is empty");

  const priceLamports = Number(quoteAmount) / Number(baseAmount); // цена в lamports
  const priceInSOL = priceLamports / 1e9;

  return priceInSOL;
}

export async function buyTokenOnLaunchpad({
  payerKeypair,
  mintPubkey,
  amountInSol,
}: {  
  payerKeypair: Keypair;
  mintPubkey: PublicKey;
  amountInSol: number;
}) {
  const payer = payerKeypair.publicKey;
  const minAmountOutTokens = await getRaydiumTokenPrice(mintPubkey) * amountInSol;
  const pdas = await derivePDAs(mintPubkey);

  const tx = new Transaction();
  const baseTokenAccount = await getAssociatedTokenAddress(
    mintPubkey,
    payer,
    false,
    TOKEN_PROGRAM_ID,
    ASSOC_TOKEN_ACC_PROG
  );

  const info = await connection.getAccountInfo(baseTokenAccount);
  if (!info) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        payer,
        baseTokenAccount,
        payer,
        mintPubkey
      )
    );
  }
  const ataIx = createAssociatedTokenAccountInstruction(
    payerKeypair.publicKey,  // payer
    baseTokenAccount,                     // ata address
    payerKeypair.publicKey,  // owner
    mintPubkey
  );

  const {
    wsolTokenAccount,
    instructions: wsolInstructions,
    wsolKeypair,
  } = await createTemporaryWsolAccount(payer, amountInSol);

  const buyIx = createBuyInstruction({
    payer,
    poolState: pdas.poolState,
    baseVault: pdas.baseVault,
    quoteVault: pdas.quoteVault,
    baseMint: mintPubkey,
    baseTokenAccount,
    wsolTokenAccount,
    amountInSol,
    minAmountOutTokens,
  });

  const closeIx = await getCloseWsolInstruction(wsolTokenAccount, payer);

  tx.add(...wsolInstructions, buyIx, closeIx);

  const signers = [payerKeypair, wsolKeypair];

  const result = await sendAndConfirmTransaction(tx, signers, {
    skipPreflight: true,
    confirm: true,
    maxRetries: 3,
  });

  console.log("Buying was succesfull:", result);
  return result;
}

async function decodeMetadata(buffer: Buffer) {
  const name = buffer.slice(65, 97).toString("utf8").replace(/\0/g, "").trim();
  const symbol = buffer.slice(97, 112).toString("utf8").replace(/\0/g, "").trim();
  const uri = buffer.slice(117, 307).toString("utf8").replace(/\0/g, "").trim();

  return { name, symbol, uri };
}

export async function getLaunchpadTokenInfo(mint: PublicKey) {
  const pdas = await derivePDAs(mint);

  const [metadataAccount, poolStateInfo, baseVaultInfo, quoteVaultInfo] = await Promise.all([
    connection.getAccountInfo(pdas.metadata),
    connection.getAccountInfo(pdas.poolState),
    getAccount(connection, pdas.baseVault),
    getAccount(connection, pdas.quoteVault),
  ]);

  if (!metadataAccount || !poolStateInfo) return null;

  const metadataDecoded = await decodeMetadata(metadataAccount.data);

  const uri = metadataDecoded.uri;
  const jsonMeta = await fetch(uri).then((r) => r.json()).catch(() => ({}));
  const logoURI = jsonMeta?.image || null;

  const poolData = poolStateInfo.data;
  const quoteRaising = new BN(poolData.slice(8, 16), "le");
  const baseSell = new BN(poolData.slice(16, 24), "le");

  const baseAmount = Number(baseVaultInfo.amount);
  const quoteAmount = Number(quoteVaultInfo.amount);

  const baseTokens = baseAmount / (10 ** 6);
  const quoteSOL = quoteAmount / 1e9;

  const priceInSOL = await getRaydiumTokenPrice(mint);

  const liquidity = (baseTokens * priceInSOL) + quoteSOL;
  const marketCap = baseTokens * priceInSOL;

  return {
    name: metadataDecoded.name,
    symbol: metadataDecoded.symbol,
    logoURI,
    address: mint.toBase58(),
    liquidity,
    marketCap,
    decimals: 6,
    totalSupply: baseSell.toString(),
    quoteRaising: quoteRaising.toString(),
    vaultBalances: {
      baseTokens: baseVaultInfo.amount,
      quoteSOL,
    },
    priceSol: priceInSOL,
  };
}