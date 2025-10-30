import { tool } from 'ai';
import { z } from 'zod';

export const kaminoPrompts = {
  KAMINO_LIST_RESERVES: tool({
    description: "Show available tokens in Kamino Lending with APY, LTV, and availability. Use this when user asks for list of tokens, reserves, or available assets in Kamino.",
    parameters: z.object({
      market: z.string().optional().describe('Market pubkey or "" to use main market'),
    }),
  }),

  KAMINO_GET_MARKETS: tool({
    description: "Get all Kamino markets for a programId.",
    parameters: z.object({}),
  }),

  KAMINO_GET_MARKET: tool({
    description: "Get a single Kamino market config by market pubkey. Pass empty string to use main market.",
    parameters: z.object({
      market: z.string().describe('Market pubkey or "" to use main market'),
    }),
  }),



  KAMINO_MY_POSITIONS: tool({
    description: "Show my current Kamino positions - deposits and borrows. Use this when user asks about their Kamino assets, deposits, or what they have in Kamino.",
    parameters: z.object({}),
  }),

  KAMINO_LEND_DEPOSIT: tool({
    description: "Deposit asset into Kamino Lending (requires signer).",
    parameters: z.object({
      token: z.string().min(1).describe("Symbol or mint (e.g. 'USDC' or mint)"),
      amount: z.number().positive().describe("UI amount"),
    }),
  }),

  KAMINO_LEND_WITHDRAW: tool({
    description: "Withdraw asset from Kamino Lending (requires signer).",
    parameters: z.object({
      token: z.string().min(1).describe("Symbol or mint"),
      amount: z.number().positive().describe("UI amount"),
    }),
  }),

  KAMINO_LEND_BORROW: tool({
    description: "Borrow an asset from Kamino Lending (requires signer and collateral).",
    parameters: z.object({
      token: z.string().min(1).describe("Symbol or mint to borrow"),
      amount: z.number().positive().describe("UI amount to borrow"),
    }),
  }),

  KAMINO_LEND_REPAY: tool({
    description: "Repay borrowed amount to Kamino Lending (requires signer).",
    parameters: z.object({
      token: z.string().min(1).describe("Symbol or mint to repay"),
      amount: z.number().positive().describe("UI amount to repay"),
    }),
  }),

  KAMINO_LEND_HEALTH: tool({
    description: "Show Kamino position health (LTV, limits).",
    parameters: z.object({
      user: z.string().min(1).describe("User wallet pubkey"),
    }),
  }),

  KAMINO_GET_RESERVE_HISTORY: tool({
    description: "Get reserve metrics history (tvl, apys, etc.).",
    parameters: z.object({
      market: z.string().min(1).describe("Market pubkey"),
      reserve: z.string().min(1).describe("Reserve pubkey"),
      start: z.string().describe('ISO date or ""'),
      end: z.string().describe('ISO date or ""'),
      frequency: z.enum(["hour","day"]).describe('Use "day" if unsure'),
      env: z.string().describe('Cluster id or "" (default mainnet-beta)'),
    }),
  }),

  KAMINO_GET_OBLIGATION_PNL: tool({
    description: "Get PnL for a single obligation.",
    parameters: z.object({
      market: z.string().min(1).describe("Market pubkey"),
      obligation: z.string().min(1).describe("Obligation pubkey"),
      positionMode: z.enum(["current_obligation","user_all_current_positions"]).describe("Mode"),
      useStakeRate: z.boolean().describe("true/false"),
    }),
  }),

  KAMINO_GET_AVAILABLE_TOKENS: tool({
    description: "Get list of all available tokens in Kamino Finance with their symbols and mint addresses. Use this when user asks about supported tokens or wants to see what tokens are available for lending/borrowing.",
    parameters: z.object({}),
  }),

  KAMINO_CHECK_TOKEN_SUPPORT: tool({
    description: "Check if a specific token is supported in Kamino Finance. Use this before attempting operations with unknown tokens.",
    parameters: z.object({
      token: z.string().min(1).describe("Token symbol or mint address to check"),
    }),
  }),

  KAMINO_GET_TOKEN_METRICS: tool({
    description: "Get detailed metrics for a specific token in Kamino (LTV, APY, supply/borrow amounts). Use this when user wants to know specific metrics for a token before making decisions.",
    parameters: z.object({
      token: z.string().min(1).describe("Token symbol or mint address"),
    }),
  }),
}