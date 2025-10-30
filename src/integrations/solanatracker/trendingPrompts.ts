import { tool } from "ai";
import { z } from "zod";


export const trendingPrompts = {
    TRENDING_TOKENS: tool({
        description:
            `Get trending tokens on Solana\n` +
            `When to use: the user asks "what's trending right now?" or needs a quick shortlist.\n` +
            `Output (resForAi): { asOf: epoch_ms, items: [{ mint, name, symbol, image?, change24h?, priceUsd?, marketCapUsd? }] }\n` +
            `Notes: prefer mint addresses if the model needs to resolve ambiguity later.`,
        parameters: z.object({
            timeframe: z
                .enum(["5m", "15m", "30m", "1h", "6h", "12h", "24h"])
                .optional()
                .describe(`Lookback window (default: "1h").`),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .optional()
                .describe(`How many items to return (default: 5, max: 50).`),
        }),
    }),
};