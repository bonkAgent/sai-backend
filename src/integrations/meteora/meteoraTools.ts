import { Keypair, Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';
import DLMM from '@meteora-ag/dlmm';

import { TOOL_HANDLERS } from '../../promtsAI/tool-handlers';
import { getBalances, getMeteoraPositions, setMeteoraPosition, deleteMeteoraPosition } from '../../services/mongoService';
import { enoughMoney } from '../../utils/enoughMoney';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const isSolMint = (mintStr: string) => mintStr === SOL_MINT;

async function toUnit(conn: Connection, mintStr: string, uiAmount: number): Promise<BN> {
  if (isSolMint(mintStr)) {
    return new BN(Math.floor(uiAmount * LAMPORTS_PER_SOL));
  }
  const mint = await getMint(conn, new PublicKey(mintStr));
  const decimals = mint.decimals ?? 0;
  return new BN(Math.floor(uiAmount * 10 ** decimals));
}
export type ToolHandler = (args: any, keypair?: Keypair, user?: any) => any | Promise<any>;
import fetch from 'node-fetch';
import { publicKey } from '@coral-xyz/anchor/dist/cjs/utils';


export const METEORA_TOOL_HANDLERS: Record<string, ToolHandler> = {
  GET_METEORA_POSITIONS: async (args: {}, keypair?: Keypair,user?: any) => {
    try {
      const positions = (await getMeteoraPositions(user)) || [];
      return {resForAi: {positions}}
    } catch (err) {
      return {
        resForAi: { status: 'error', err }
      };
    }
  },

  GET_TOP_METEORA_POOLS: async (args: {}, keypair?: Keypair,user?: any) => {
    try {

      const byDesc = <T>(selector: (x: T) => number) => (a: T, b: T) => selector(b) - selector(a);
      const response = await fetch("https://dlmm-api.meteora.ag/pair/all_by_groups?hide_low_tvl=75000");

      if (!response.ok) {
        return {
          resForAi: { status: 'error', message: `HTTP ${response.status} ${response.statusText}` }
        };
      }

      const data = await response.json();
      const pools: Array<Object>  = [];
      for(const group of data.groups){
        pools.push(...group.pairs);
      }

      const toNum = (v: unknown): number => {
        if (v == null) return 0;
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        if (typeof v === 'string') {
          const n = Number((v as string).replace?.(/,/g, '') ?? v);
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      };

      const getPathNum = (obj: any, path: string, def = 0): number => {
        const val = path.split('.').reduce<any>((o, k) => (o && o[k] != null ? o[k] : undefined), obj);
        return toNum(val ?? def);
      };

      const byVolume24h = [...pools].sort(byDesc((p: any) => getPathNum(p, 'volume.hour_24'))).slice(0, 20);
      const byApr = [...pools].sort(byDesc((p: any) => toNum(p.apr))).slice(0, 20);
      const byFees24h = [...pools].sort(byDesc((p: any) => toNum(p.fees_24h))).slice(0, 20);
            

      return {
        resForAi: {
          byVolume24h,
          byApr,
          byFees24h,
        }
      };
    } catch (err) {
      return {
        resForAi: { status: 'error', err }
      };
    }
  },

  GET_METEORA_POOL: async (args: {address: string}, keypair?: Keypair,user?: any) => {
    try {
      const response = await fetch(`https://dlmm-api.meteora.ag/pair/${args.address}`);

      if (!response.ok) {
        return {
          resForAi: { status: 'error', message: `HTTP ${response.status} ${response.statusText}` }
        };
      }

      const data = await response.json();
      return {
        resForAi: {
          data
        },
        resForStatus: {
          data
        },
      };
    } catch (err) {
      return {
        resForAi: { status: 'error', err }
      };
    }
  },

  ADD_METEORA_LIQUIDITY: async (
    args: { position: string, newPoolAddress: string, amountSol: number, priorityFee:number },
    keypair?: Keypair,
    user?: any
  ) => {
    try {
      const { position, amountSol, newPoolAddress} = args;
      const priorityFee= args.priorityFee || 10000;
      const conn = new Connection(process.env.RPC_URL!);
      const balance = await getBalances(user);

      if(!position){
        if (!enoughMoney(balance, amountSol, SOL_MINT, 0.054 )) {
          return { resForAi: { status: 'Error user dont have enough money' } };
        }

        if(newPoolAddress.length !== 0){
          const posKeypair = new Keypair();
          const poolAddress = new PublicKey(newPoolAddress);
          const dlmm = await DLMM.create(conn, poolAddress);
          const poolData = (await METEORA_TOOL_HANDLERS.GET_METEORA_POOL({ address: newPoolAddress }, keypair, user))?.resForAi?.data;
          if (!poolData) {
            return { resForAi: { status: 'Pool not found' } };
          }

          let xUi: number;
          if (!isSolMint(poolData.mint_x)) {
            const swapX = (await TOOL_HANDLERS.SWAP({
              from: SOL_MINT,
              to: poolData.mint_x,
              amount: `${amountSol / 2}`,
              priorityFee
            }, keypair, user)).resForStatus;
            if(!swapX){
              return {resForAi:{error:"error while swap"}}
            }
            xUi = swapX.amountTo;
          } else {
            xUi = amountSol / 2;
          }
          const xAmt = await toUnit(conn, poolData.mint_x, xUi);

          let yUi: number;
          if (!isSolMint(poolData.mint_y)) {
            const swapY = (await TOOL_HANDLERS.SWAP({
              from: SOL_MINT,
              to: poolData.mint_y,
              amount: `${amountSol / 2}`,
              priorityFee
            }, keypair, user)).resForStatus;
            if(!swapY){
              return {resForAi:{error:"error while swap"}}
            }
            yUi = swapY.amountTo;
          } else {
            yUi = amountSol / 2;
          }
          const yAmt = await toUnit(conn, poolData.mint_y, yUi);
          const bins = (await dlmm.getBinsAroundActiveBin(20,20)).bins;
          const addTx = await dlmm.initializePositionAndAddLiquidityByStrategy({
            positionPubKey: posKeypair.publicKey,
            totalXAmount: xAmt,
            totalYAmount: yAmt,
            strategy:{
              maxBinId: bins[41].binId,
              minBinId: bins[0].binId,
              strategyType:0,
            },
            user: keypair?.publicKey!,
            slippage: 10000
          })
          addTx.sign(
            keypair!,
            posKeypair
          );

          const sig = await conn.sendRawTransaction(addTx.serialize(), { skipPreflight: true });
          await conn.confirmTransaction(sig);
          await setMeteoraPosition(user, {
            secretKey: bs58.encode(posKeypair.secretKey),
            publicKey: posKeypair.publicKey.toString(),
            poolName: poolData.name,
            poolAddress: poolData.address,
            minBin: bins[0].binId,
            maxBin: bins[41].binId,
            amountSol: amountSol,
          });
          return { 
            resForAi: {
              poolName: poolData.name,
              posPublicKey: posKeypair.publicKey.toString(),
              finalAmountOfSolOnPosition: amountSol,
              addedtokenX: poolData.name.split("-")[0],
              amontX: xUi,
              addedtokenY: poolData.name.split("-")[1],
              amontY: yUi,
            },
            resForStatus: {
              poolName: poolData.name,
              finalAmountOfSolOnPosition: amountSol,
              addedtokenX: poolData.name.split("-")[0],
              amontX: xUi,
              addedtokenY: poolData.name.split("-")[1],
              amontY: yUi
            } 
          };
        }else{
          return { resForAi: { status: 'You need to write or existing postion or pool address' } };
        }
      }

      if (!enoughMoney(balance, amountSol, SOL_MINT, 0.004)) {
        return { resForAi: { status: 'Error user dont have enough money' } };
      }
      const positions = (await getMeteoraPositions(user)) || [];
      const existingPos = positions.find((p: any) => p.publicKey === position);
      if (!existingPos) {
        return { resForAi: { status: `Position ${position} not found` } };
      }

      const poolAddress = new PublicKey(existingPos.poolAddress);
      const dlmm = await DLMM.create(conn, poolAddress);
      const posAcc = await dlmm.getPosition(new PublicKey(existingPos.publicKey));
      const poolData = (await METEORA_TOOL_HANDLERS.GET_METEORA_POOL({ address: existingPos.poolAddress }, keypair, user))?.resForAi?.data;
      if (!poolData) {
        return { resForAi: { status: 'Pool not found' } };
      }

      let xUi: number;
      if (!isSolMint(poolData.mint_x)) {
        const swapX = (await TOOL_HANDLERS.SWAP({
          from: SOL_MINT,
          to: poolData.mint_x,
          amount: `${amountSol / 2}`,
          priorityFee
        }, keypair, user)).resForStatus;
        if(!swapX){
          return {resForAi: {error:"Error during swap"}}
        }
        xUi = swapX.amountTo;
      } else {
        xUi = amountSol / 2;
      }
      const xAmt = await toUnit(conn, poolData.mint_x, xUi);

      let yUi: number;
      if (!isSolMint(poolData.mint_y)) {
        const swapY = (await TOOL_HANDLERS.SWAP({
          from: SOL_MINT,
          to: poolData.mint_y,
          amount: `${amountSol / 2}`,
          priorityFee
        }, keypair, user)).resForStatus;
        if(!swapY){
          return {resForAi: {error:"Error during swap"}}
        }
        yUi = swapY.amountTo;
      } else {
        yUi = amountSol / 2;
      }
      const yAmt = await toUnit(conn, poolData.mint_y, yUi);

      const addTx = await dlmm.addLiquidityByStrategy({
        positionPubKey: new PublicKey(existingPos.publicKey),
        user: keypair!.publicKey,
        totalXAmount: xAmt,
        totalYAmount: yAmt,
        strategy: {
          minBinId: existingPos.minBin,
          maxBinId: existingPos.maxBin,
          strategyType: 0,
        },
        slippage: 1000
      });

      addTx.sign(
        keypair!,
        Keypair.fromSecretKey(bs58.decode(existingPos.secretKey))
      );

      const sig = await conn.sendRawTransaction(addTx.serialize(), { skipPreflight: true });
      await conn.confirmTransaction(sig);

      await setMeteoraPosition(user, {
        secretKey: existingPos.secretKey,
        publicKey: existingPos.publicKey,
        poolName: existingPos.poolName,
        poolAddress: existingPos.poolAddress,
        minBin: existingPos.minBin,
        maxBin: existingPos.maxBin,
        amountSol: (existingPos.amountSol ?? 0) + amountSol,
      });

      return { 
        resForAi: {
          poolName: existingPos.poolName,
          finalAmountOfSolOnPosition: (existingPos.amountSol ?? 0) + amountSol,
          addedtokenX: poolData.name.split("-")[0],
          amontX: xUi,
          addedtokenY: poolData.name.split("-")[1],
          amontY: yUi,
          id: sig
        },
        resForStatus: {
          poolName: existingPos.poolName,
          finalAmountOfSolOnPosition: (existingPos.amountSol ?? 0) + amountSol,
          addedtokenX: poolData.name.split("-")[0],
          amontX: xUi,
          addedtokenY: poolData.name.split("-")[1],
          amontY: yUi,
          id: sig
        } 
      };

    } catch (error: any) {
      console.log(error);
      return { resForAi: { error: `Failed: ${error.message}` } };
    }
  },

  REMOVE_METEORA_LIQUIDITY: async (
    args: { position: string; amountSol: number },
    keypair?: Keypair,
    user?: any
  ) => {
    try {
      const { position, amountSol } = args;
      const conn = new Connection(process.env.RPC_URL!);

      const balance = await getBalances(user);
      if (!enoughMoney(balance, 0, SOL_MINT, 0.004)) {
        return { resForAi: { status: 'Error user dont have enough money' } };
      }

      const positions = (await getMeteoraPositions(user)) || [];
      const existingPos = positions.find((p: any) => p.publicKey === position);
      if (!existingPos) {
        return { resForAi: { status: `Position ${position} not found` } };
      }

      const dlmm = await DLMM.create(conn, new PublicKey(existingPos.poolAddress));

      let bps = Math.floor((amountSol / (existingPos.amountSol || 1)) * 10_000);
      if (!Number.isFinite(bps) || bps <= 0) bps = 1;
      if (bps > 10_000) bps = 10_000;

      const removeTxs = await dlmm.removeLiquidity({
        position: new PublicKey(existingPos.publicKey),
        user: keypair!.publicKey,
        fromBinId: existingPos.minBin,
        toBinId: existingPos.maxBin,
        bps: new BN(bps),
        shouldClaimAndClose: false,
      });
      const sigs = [];
      for (const tx of removeTxs) {
        tx.sign(
          keypair!,
          Keypair.fromSecretKey(bs58.decode(existingPos.secretKey))
        );
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        await conn.confirmTransaction(sig);
        sigs.push(sig);
        console.log('Removed liquidity tx:', sig);
      }

      const newAmt = Math.max(0, (existingPos.amountSol ?? 0) - amountSol);
      await setMeteoraPosition(user, {
        secretKey: existingPos.secretKey,
        publicKey: existingPos.publicKey,
        poolName: existingPos.poolName,
        poolAddress: existingPos.poolAddress,
        minBin: existingPos.minBin,
        maxBin: existingPos.maxBin,
        amountSol: newAmt,
      });

      return { 
        resForAi: {
          poolName: existingPos.poolName,
          finalAmountOfSolOnPosition: newAmt,
          id: sigs
        },
        resForStatus: {
          poolName: existingPos.poolName,
          finalAmountOfSolOnPosition: newAmt,
          id: sigs
        } 
      };

    } catch (error: any) {
      console.log(error);
      return { resForAi: { error: `Failed: ${error.message}` } };
    }
  },

  REBALANCE_METEORA_LIQUIDITY: async (
    args: { position: string },
    keypair?: Keypair,
    user?: any
  ) => {
    try {
      const { position } = args;
      const range = 20;
      const conn = new Connection(process.env.RPC_URL!);

      const balance = await getBalances(user);
      if (!enoughMoney(balance, 0, SOL_MINT, 0.054)) {
        return { resForAi: { status: 'Error user dont have enough money' } };
      }

      const positions = (await getMeteoraPositions(user)) || [];
      const existingPos = positions.find((p: any) => p.publicKey === position);
      if (!existingPos) {
        return { resForAi: { status: `Position ${position} not found` } };
      }

      const poolPk = new PublicKey(existingPos.poolAddress);
      const dlmm = await DLMM.create(conn, poolPk);

      const closeTx = await dlmm.removeLiquidity({
        position: new PublicKey(existingPos.publicKey),
        user: keypair!.publicKey,
        fromBinId: existingPos.minBin,
        toBinId: existingPos.maxBin,
        bps: new BN(10_000),
        shouldClaimAndClose: true,
      });


      for (const tx of closeTx) {
        tx.sign(
          keypair!,
          Keypair.fromSecretKey(bs58.decode(existingPos.secretKey))
        );
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        await conn.confirmTransaction(sig);
        console.log('Closed old position tx:', sig);
      }

      await deleteMeteoraPosition(user, existingPos.publicKey);

      const bins = await dlmm.getBinsAroundActiveBin(range, range);
      const minBinId = bins.bins[0].binId;
      const maxBinId = bins.bins[bins.bins.length - 1].binId;

      const poolData = (await METEORA_TOOL_HANDLERS.GET_METEORA_POOL({ address: existingPos.poolAddress }, keypair, user))?.resForAi?.data;
      if (!poolData) {
        return { resForAi: { status: 'Pool not found' } };
      }

      let xUi: number;
      if (!isSolMint(poolData.mint_x)) {
        const swapX = (await TOOL_HANDLERS.SWAP({
          from: SOL_MINT,
          to: poolData.mint_x,
          amount: `${(existingPos.amountSol ?? 0) / 2}`,
        }, keypair, user)).resForStatus;
        xUi = swapX.amountTo;
      } else {
        xUi = (existingPos.amountSol ?? 0) / 2;
      }
      const totalXAmount = await toUnit(conn, poolData.mint_x, xUi);

      let yUi: number;
      if (!isSolMint(poolData.mint_y)) {
        const swapY = (await TOOL_HANDLERS.SWAP({
          from: SOL_MINT,
          to: poolData.mint_y,
          amount: `${(existingPos.amountSol ?? 0) / 2}`,
        }, keypair, user)).resForStatus;
        yUi = swapY.amountTo;
      } else {
        yUi = (existingPos.amountSol ?? 0) / 2;
      }
      const totalYAmount = await toUnit(conn, poolData.mint_y, yUi);

      // 5) Создаём новую позицию
      const newPosKeypair = new Keypair();
      const addTx = await dlmm.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosKeypair.publicKey,
        user: keypair!.publicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
          minBinId,
          maxBinId,
          strategyType: 0,
        },
      });

      addTx.sign(keypair!, newPosKeypair);

      const sigAdd = await conn.sendRawTransaction(addTx.serialize(), { skipPreflight: true });
      await conn.confirmTransaction(sigAdd);

      await setMeteoraPosition(user, {
        secretKey: bs58.encode(newPosKeypair.secretKey),
        publicKey: newPosKeypair.publicKey.toBase58(),
        poolName: existingPos.poolName,
        poolAddress: existingPos.poolAddress,
        minBin: minBinId,
        maxBin: maxBinId,
        amountSol: existingPos.amountSol,
      });

      return { resForAi: `Closed old position ${position} and opened new one ${newPosKeypair.publicKey.toBase58()}` };

    } catch (error: any) {
      console.log(error);
      return { resForAi: { error: `Failed: ${error.message}` } };
    }
  },

  CLOSE_METEORA_POSITION: async (
    args: { position: string },
    keypair?: Keypair,
    user?: any
  ) => {
    try {
      const { position } = args;
      const conn = new Connection(process.env.RPC_URL!);

      const balance = await getBalances(user);
      if (!enoughMoney(balance, 0, SOL_MINT, 0.0002)) {
        return { resForAi: { status: 'Error user dont have enough money' } };
      }

      const positions = (await getMeteoraPositions(user)) || [];
      const existingPos = positions.find((p: any) => p.publicKey === position);
      if (!existingPos) {
        return { resForAi: { status: `Position ${position} not found` } };
      }

      const poolPk = new PublicKey(existingPos.poolAddress);
      const dlmm = await DLMM.create(conn, poolPk);
      
      const removeTxs = await dlmm.removeLiquidity({ 
        position: new PublicKey(existingPos.publicKey),
        user: keypair!.publicKey,
        fromBinId: existingPos.minBin,
        toBinId: existingPos.maxBin,
        bps: new BN(10_000),
        shouldClaimAndClose: false,
      });

      const sigs = [];
      for (const tx of removeTxs) {
        tx.sign(
          keypair!,
          Keypair.fromSecretKey(bs58.decode(existingPos.secretKey))
        );
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        await conn.confirmTransaction(sig);
        sigs.push(sig);
        console.log('Removed liquidity tx:', sig);
      }

      const txs = await dlmm.claimAllRewards({
        owner: keypair!.publicKey,
        positions: [await dlmm.getPosition(new PublicKey(existingPos.publicKey))]
      });

      for (const tx of txs) {
        tx.sign(
          keypair!,
          Keypair.fromSecretKey(bs58.decode(existingPos.secretKey))
        );
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        await conn.confirmTransaction(sig);
        sigs.push(sig);
        console.log('Claimed reward tx:', sig);
      }

      const closeTx = await dlmm.closePosition({
        owner: keypair!.publicKey,
        position: await dlmm.getPosition(new PublicKey(existingPos.publicKey)),
      });

      closeTx.sign(
        keypair!,
        Keypair.fromSecretKey(bs58.decode(existingPos.secretKey))
      );

      const sig = await conn.sendRawTransaction(closeTx.serialize(), { skipPreflight: true });
      await conn.confirmTransaction(sig);

      await deleteMeteoraPosition(user, existingPos.publicKey);

      return { resForAi: `Closed position ${position}` };

    } catch (error: any) {
      console.log(error);
      return { resForAi: { error: `Failed: ${error.message}` } };
    }
  },

  CLAIM_METEORA_REWARD: async (args: { }, keypair?: Keypair,user?: any) => {
    try {
      const balance = await getBalances(user);
      if(!enoughMoney(balance, 0, "So11111111111111111111111111111111111111112", 0.0002)){
        return {resForAi:{ status: `Error user dont have enough money` }}
      }

      const conn = new Connection(process.env.RPC_URL!);
      const positions = await getMeteoraPositions(user);
      const keys = [];
      let transactions: Transaction[] = [];

      for (const pos of positions) {
        const dlmm = await DLMM.create(conn, new PublicKey(pos.poolAddress));
        const txs = await dlmm.claimAllRewards({
          owner: keypair!.publicKey,
          positions: [await dlmm.getPosition(Keypair.fromSecretKey(bs58.decode(pos.secretKey)).publicKey)]
        });
        transactions.push(...txs);
        keys.push(pos.secretKey)
      }

      for (let x = 0; x< transactions.length; x++) {
        console.log(transactions[x].instructions);
        transactions[x].sign(keypair!, Keypair.fromSecretKey(bs58.decode(keys[x])));
        const sig = await conn.sendRawTransaction(transactions[x].serialize(), { skipPreflight: true });
        console.log("Sent tx:", sig);
      }

      return {resForAi :positions};
    } catch (error: any) {
      console.log(error)
      return { resForAi:{error: `Failed: ${error.message}`} };
    }
  },
}