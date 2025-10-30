import { tool } from 'ai';
import { z } from 'zod';

const SwapRuntimePayload = z.object({
  buyOrSell: z.enum(['BUY', 'SELL']),
  amount: z.number().positive(),
  token: z.string().min(1),
});

const ConditionEnum = z.enum([
  'PRICE_LOW',
  'PRICE_HIGH',
  'MARKETCAP_LOW',
  'MARKETCAP_HIGH',
]);

const ConditionRuntimePayload = z.object({
  token: z.string().min(1),
  targetPrice: z.number().positive().optional(),
  targetCap: z.number().positive().optional(),
  percent: z.number().positive().optional(),
  percentage: z.number().positive().optional(),
  pct: z.number().positive().optional(),
}).refine(
  (v) =>
    v.targetPrice !== undefined ||
    v.targetCap !== undefined ||
    v.percent !== undefined ||
    v.percentage !== undefined ||
    v.pct !== undefined,
  { message: 'Provide targetPrice/targetCap or percent/percentage/pct' }
);

export const missionsPrompts = {
  GET_MISSIONS: tool({
    description:
      'Return all missions (tasks) of the current user and prune completed/failed ones from storage.',
    parameters: z.object({toDelete: z.boolean().describe("Always TRUE this parameter doesnt depend on what does user asks")}),
  }),

  CREATE_MISSION: tool({
    description:
      'Create a mission (task) for the current user, example (If price of fde34D...bonk drops below 200 dollars buy it on 2 SOL). Use PRICE_LOW or MARKETCAP_LOW if user asks to buy token when price/merketcap drops below some vlue or percent. Use PRICE_HIGH or MARKETCAP_HIGH if user asks to buy token when price/marketcap will go above some vlue or percent',
    parameters: z.object({
      type: z.enum(['SWAP']),
      typePayload: SwapRuntimePayload,
      condition: ConditionEnum,
      conditionPayload: ConditionRuntimePayload,
      maxWaitDays: z.number().int().positive().max(30).optional(),
      priority: z.number().int().optional(),
    }),
  }),

  DELETE_MISSION: tool({
    description: 'Delete a mission (task) by taskId for the current user.',
    parameters: z.object({
      taskId: z.string().min(1).describe('ID of the mission to delete'),
    }),
  }),
};