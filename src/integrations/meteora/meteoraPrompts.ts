import { tool } from 'ai';
import { z } from 'zod';

export const meteoraPrompts = {
  GET_TOP_METEORA_POOLS: tool({
    description:
      `List the top 20 Meteora pools (last 24h) with volume, APR, and fees.
When to use: user asks for best/most active pools on Meteora.
Input: none. Output: ranked list with key stats.`,
    parameters: z.object({}),
  }),

  GET_METEORA_POOL: tool({
    description:
      `Get detailed info for a specific Meteora pool by address.
When to use: user references a pool or needs its metrics/range/fees.
Input: pool public key (base58).`,
    parameters: z.object({
      address: z.string().describe(
        `Meteora pool public key (base58), e.g. "9xX...".`
      ),
    }),
  }),

  GET_METEORA_POSITIONS: tool({
    description:
      `Fetch all user's Meteora positions, including active range status.
When to use: overview of current LP positions on Meteora.
Input: none (uses connected wallet).`,
    parameters: z.object({}),
  }),

  CLAIM_METEORA_REWARD: tool({
    description:
      `Claim all available rewards from all of the user's Meteora positions.
When to use: user asks to harvest/claim rewards across positions.
Input: none (uses connected wallet).`,
    parameters: z.object({}),
  }),

  ADD_METEORA_LIQUIDITY: tool({
    description:
      `Add liquidity to an existing Meteora position, or open a new one if no position is specified.
When to use: user wants to deposit SOL into a pool/position.
Input: pool address, position key (or "" to create new), amount in SOL.`,
    parameters: z.object({
      newPoolAddress: z.string().describe(
        `Pool public key (base58) to provide liquidity to.`
      ),
      position: z.string().describe(
        `Existing position public key (base58). If the user did not specify a position and wants a NEW position, pass an empty string "" explicitly.`
      ),
      amountSol: z.number().describe(
        `Amount of SOL to add (numeric), e.g., 0.5`
      ),
    }),
  }),

  REMOVE_METEORA_LIQUIDITY: tool({
    description:
      `Remove a specific amount of liquidity from an existing Meteora position.
When to use: user wants to withdraw part of their liquidity.
Input: position key and amount in SOL.`,
    parameters: z.object({
      position: z.string().describe(
        `Position public key (base58) to withdraw from.`
      ),
      amountSol: z.number().describe(
        `Amount of SOL to remove (numeric), e.g., 0.25`
      ),
    }),
  }),

  REBAlANCE_METEORA_LIQUIDITY: tool({
    description:
      `Rebalance a Meteora position: close it and reopen with a new bin/range while keeping the same SOL amount.
When to use: user asks to adjust the price range/bins to current market.
Input: position key.`,
    parameters: z.object({
      position: z.string().describe(
        `Position public key (base58) to rebalance.`
      ),
    }),
  }),

  CLOSE_METEORA_POSITION: tool({
    description:
      `Fully close a Meteora position and remove it from storage.
When to use: user wants to exit a position completely.
Input: position key.`,
    parameters: z.object({
      position: z.string().describe(
        `Position public key (base58) to close.`
      ),
    }),
  }),
}