import { tool } from 'ai';
import { z } from 'zod';
import { kaminoPrompts } from "../integrations/kamino/kaminoPrompts";
import { meteoraPrompts } from "../integrations/meteora/meteoraPrompts";
import { missionsPrompts } from "../missions/missionsPrompts";
import {trendingPrompts} from "../integrations/solanatracker/trendingPrompts";

/**
 * NOTE (Solana context):
 * Все инструменты работают в экосистеме Solana. В полях, где допустим тикер или mint,
 * предпочитай mint-адрес при неоднозначности. Адреса — base58 (32–44+ символов).
 */
export const manualTools = {
  FETCH_PRICE: tool({
    description: `
Get current USD price of one or many tokens.
Exmaple of user's requests: 
    What is price of BONK;
    Give me price of So1111111111111111111111111111111111111BONK;`,
    parameters: z.object({
      tickers: z.array(z.string()).min(1).describe(
        `Array of token symbols or mint addresses. Examples: ["SOL", "So11111111111111111111111111111111111111112"]`
      ),
    }),
  }),

  GET_TOKEN_DATA: tool({
    description: `
Get full analytics of token.
Exmple of user's requests:
    Give me info about BONK
    Analazy this token So1111111111111111111111111111111111111BONK
    What do you know about So1111111111111111111111111111111111111BONK
There is tamplate for your answer:

1) HEADER
- (If available) token avatar image on its own line.
- \`# {{emoji}} {{name}} ({{symbol}})\`
- One-line “capsule” with 2–4 highlights (price, 24h change, volume, liquidity, holders).

2) 📊 **Trade Data**
- **Price:** $X.xx (24h: +Y.yy%)
- **Volume 24h:** $X
- **Market Cap:** $X
- **Liquidity:** $X (**{{stablePct}}% stable** if available)
- **Holders:** N  • **Markets:** N
- **Supply:** Circulating / Total = X / Y
- **Performance mini-cards**:
  - ⏱️ 5m: +x%  • 🕐 1h: +x%  • ⏰ 6h: +x%  • 🌞 24h: +x%
  (Only show for intervals you actually have.)

3) 📦 **Ownership & Distribution**
- **Creator:** \`{{short(creator)}}\` (linked) • **Creator Balance:** X {{sym}} ({{pct}}%)
- **Top 10 Ownership:** X%
- **Top mini-cards:** Top1 X% • Top3 X% • Top10 X%
- **Holder table (abridged)** with 3–6 rows: Address | Balance | % of circ (each address linked).

4) 🚨 **Risk & Security**
- **Risk Score:** X / 100 (band emoji: ✅/⚠️/🚨)
- **Authorities:** Mint = Revoked/Active, Freeze = None/Active (state short implication)
- **LP Lock:** $X (provider names if present), **LP Providers:** N
- **Insider Networks:** count N; largest size; short note (e.g., “transfer cluster”)
- **Transfer Fee:** 0% or X%
- **Quick flags:** short bullet list, red/yellow/green vibe.

5) 🧠 **Insights**
- Add key word to each statement, bullet or sentence and make it **bold**.
- 1–2 bullets about (momentum, buy/sell ratio, avg trade size).
- 2–3 bullets about connecting authorities/liquidity/holders to practical risk (exit feasibility, manipulation probability).

6) 🎯 **Next Moves**
- 3–5 concrete suggestions using the tools you actually have (e.g., “Check recent tx history”, “Swap {{symbol}} → USDC”, “Watch LP changes”, “Compare to {{other}}”).
- Keep each bullet short, with an emoji.

7) 🔗 **Quick Links**
- Solscan (token) • Website • Twitter • Telegram (only show what exists)

Example of your answer:

'![SOL logo](https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png)\\n
\\n
# 🪙 Wrapped SOL (SOL)\\n
\\n
### Capsule: $184.88 • -4.35% (24h) • Liquidity $16.0B • 4.18M holders\\n
\\n
---\\n
\\n
## 📊 Trade Data\\n
- Price: $184.88 (24h: -4.35%)\\n
- 24h Volume: $10.96B\\n
- Market Cap: $101.0B\\n
- Liquidity: $16.0B\\n
- Holders: 4,185,554\\n
- Markets: 99,094\\n
- Supply: Circulating 546.5M / Total 612.3M SOL\\n
- Performance:**\\n
  - ⏱️ 5m: +0.05% • 🕐 1h: +0.24% • ⏰ 6h: +0.20% • 🌞 24h: -4.35%\\n
\\n
---\\n
\\n
## 📦 Ownership & Distribution\\n
- Creator: [GDRyCLiAQ22L871gNs6ZNi8WUgD4tJ2dnbuFujYgCJEu](https://solscan.io/account/GDRyCLiAQ22L871gNs6ZNi8WUgD4tJ2dnbuFujYgCJEu) (0% tokens)\\n
- Top holders hold large stakes but no single dominant whale (>1.2M SOL top holder).\\n
- Top10 not concentrated excessively → **decent distribution.**\\n
- Holder table (top 5 abridged):\\n
  | Address | Balance (SOL) |\\n
  | --- | --- |\\n
  | [AVzP2GeRm...WQK49](https://solscan.io/account/AVzP2GeRmqGphJsMxWoqjpUifPpCret7LqWhD8NWQK49) | 1.27M |\\n
  | [9DrvZvyWh...Wpmo](https://solscan.io/account/9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo) | 678K |\\n
  | [GugU1tP7d...MD2m](https://solscan.io/account/GugU1tP7doLeTw9hQP51xRJyS8Da1fWxuiy2rVrnMD2m) | 592K |\\n
  (abridged)\\n
\\n
---\\n
\\n
## 🚨 Risk & Security\\n
- Risk Score: ✅ Very Safe (0/100)\\n
- Authorities: Mint & Freeze **revoked/decentralized → no admin backdoor\\n
- LP Lock & Liquidity: Huge liquidity → very low exit risk\\n
- Insider clusters & snipers: none detected\\n
- Transfer fee: 0%\\n
- Overall: Very low risk on capital safety and manipulation potential\\n
\\n
---\\n
\\n
🧠 Insights
- **Momentum**: Strong negative, -25.5% last 24h with bearish volume (-77.9%)
- **Buy/Sell Ratio**: 0.2, sellers dominate — signals capital outflow
- **Market Profile**: Mostly retail with low average trade size (~$75)
- **Liquidity**: Very low ($26.6K) → high slippage and exit risk on large trades
- **Ownership**: Top10 holds >28%, creating moderate manipulation risk
- **Security**: Good decentralization of mint/freeze authorities, no obvious backdoors
- **Social**: No linked socials; limits community trust signals
- **Trade activity**: Rapid 72% drop in volume and 72% fewer trades over 24h → waning interest
\\n
---\\n
\\n
## 🎯 Next Moves\\n
- 📈 Watch for recovery signs or support around $180.\\n
- 🔄 Compare with other Layer 1 tokens for market rotation.\\n
- 👀 Monitor on-chain wallet flows for sudden whale moves.\\n
- 🚀 Check staking opportunities on Marinade/Jito/JPool for SOL.\\n
- 🕵️‍♂️ Deep dive into transaction history on your wallet holdings.\\n
\\n
---\\n
\\n
## 🔗 Quick Links\\n
- [Solscan SOL](https://solscan.io/token/So11111111111111111111111111111111111111112)\\n
- [Official Website](https://solana.com/)\\n
- [Twitter](https://twitter.com/solana)\\n
\\n
---\\n
\\n
**Agent Bonk's take**: SOL is a blue-chip of the Solana ecosystem with massive liquidity, very low risk, and broad user base. The recent dip might be a buying opportunity if you're holding or considering entry, especially with strong staking choices to generate yield. Despite current slight downtrend, the fundamentals scream capital safety and dominance in Solana's DeFi.\\n

- Confident, witty, a bit cheeky (secret-agent vibe) but not cringe. Short, decision-oriented phrasing.
- Always tie metrics to “what it means” for users (capital safety, exit risk, manipulation risk).
- Conduct a comprehensive analysis of all the information which you have got from tool, express your opinion about this coin, and consider whether it is worth investing in it or not, as well as support your opinion with some arguments.
- Your analysis should cover almost every parameter you received from tools. It should be at least 15 sentences long.
- Also which is really important before every bullet make **bold** word which describes the whole sentence example: - **Momentum**: Strong negative, -25.5% last 24h with bearish volume (-77.9%)

VERY IMPORTANT: ALWAYS TRANSLATE ANSWER TO USER'S LANGUAGE
`,
    parameters: z.object({
      ticker: z.string().min(1).describe(
        `Token symbol or mint. Examples: "SOL", "8mznFj...pump". Prefer mint if ambiguous.`
      ),
    }),
  }),

  GET_BALANCE: tool({
    description: `Get SOL and SPL token balances for the user's wallet.\nWhen to use: you need the portfolio composition and amounts.\nInput: none (uses connected wallet).
    But also you should not render icons of tokens while using this tool.`,
    parameters: z.object({}),
  }),

  SWAP: tool({
    description: `Swap one token for another on Solana DEX routes.\nWhen to use: user asks to buy/sell/convert tokens.\nInput: from, to, amount ("ALL" allowed).\nIf asked to sell it means that user want to swap token for SOL. If asked to sell it means that user want to swap SOL for token `,
    parameters: z.object({
      from: z.string().min(1).describe(
        `Symbol or mint to give. Examples: "SOL", "So1111...".`
      ),
      to: z.string().min(1).describe(
        `Symbol or mint to receive. Examples: "USDC", "Es9vMFr...".`
      ),
      amount: z.string().min(1).describe(
        `Amount to give as string (e.g., "0.5") or "ALL".`
      ),
    }),
  }),

  GET_PORTFOLIO_VALUE: tool({
    description: `Calculate total portfolio value in USD.\nWhen to use: you need a USD summary with per-asset breakdown.\nInput: none (uses connected wallet).`,
    parameters: z.object({}),
  }),

  GET_TRANSACTION_HISTORY: tool({
    description: `Get recent on-chain transactions for the user's wallet.\nWhen to use: you need latest transfers/swaps/stakes.\nInput: limit 1–100.`,
    parameters: z.object({
      limit: z.number().int().min(1).max(100)
        .describe(`How many recent transactions to fetch (1–100).`),
    }),
  }),

  TRANSFER_TOKENS: tool({
    description: `Send SOL or any SPL token to another Solana address.\nWhen to use: user asks to transfer or pay.\nInput: recipient, amount, tokenSymbol (symbol or mint).`,
    parameters: z.object({
      recipient: z.string().min(1).describe(
        `Recipient Solana address (base58).`
      ),
      amount: z.number().positive().describe(
        `Numeric amount to send (e.g., 0.25).`
      ),
      tokenSymbol: z.string().min(1).describe(
        `Symbol or mint of the token to send. Examples: "USDC", "Es9vMFr...".`
      ),
    }),
  }),

  GET_TPS: tool({
    description: `Get current Solana network TPS (transactions per second)`,
    parameters: z.object({}),
  }),
  
  SET_FRIEND: tool({
    description: `Add a friend with a linked Solana wallet address.\nWhen to use: save a new friend for quick transfers.`,
    parameters: z.object({
      name: z.string().min(1).describe(`Friend's display name.`),
      walletAddress: z.string().min(1).describe(
        `Friend's Solana address (base58).`
      ),
    }),
  }),

  DELETE_FRIEND: tool({
    description: `Remove a friend by name from the saved list.\nWhen to use: cleanup or correction.`,
    parameters: z.object({
      name: z.string().min(1).describe(`Friend's name to delete.`),
    }),
  }),

  LIST_STAKING_OPTIONS: tool({
    description: `List SOL liquid/staking platforms with APY.\nWhen to use: compare where to stake SOL.`,
    parameters: z.object({}),
  }),

  STAKE: tool({
    description: `Stake a specific amount of SOL via Marinade / Jito / JPool.\nWhen to use: user asks to stake SOL on a supported platform.`,
    parameters: z.object({
      amount: z.number().positive().describe(`Amount of SOL to stake (e.g., 0.1).`),
      platform: z.enum(["MARINADE", "JITO", "JPOOL"]).describe(`Choose one of the supported platforms.`),
    }),
  }),

  UNSTAKE: tool({
    description: `Unstake SOL from Marinade / Jito / JPool.\nWhen to use: user asks to withdraw staked SOL.`,
    parameters: z.object({
      amount: z.number().positive().describe(`Amount of staked SOL to unstake (e.g., 0.1).`),
      platform: z.enum(["MARINADE", "JITO", "JPOOL"]).describe(`Choose one of the supported platforms.`),
    }),
  }),

  CREATE_TOKEN: tool({
    description: `Create a new token via letsbonk.fun and optionally buy initial amount.\nWhen to use: user wants to launch a meme/token quickly.`,
    parameters: z.object({
      name: z.string().describe(`Token name.`),
      symbol: z.string().describe(`Token symbol (ticker).`),
      description: z.string().describe(`Short description / narrative.`),
      twitter: z.string().url().describe(`Twitter/X URL (OPTIONAL)`).optional(),
      telegram: z.string().url().describe(`Telegram URL (OPTIONAL)`).optional(),
      website: z.string().url().describe(`Project website URL (OPTIONAL)`).optional(),
      imageUrl: z.string().url().describe(`Token image URL (OPTIONAL)`).optional(),

      amountToBuy: z.string().describe(
        `Amount in SOL to auto-buy after creation (OPTIONAL). Must be ≤ quoteRaising if set, otherwise ≤ 85.`
      ).optional(),

      quoteRaising: z.string().describe(
        `Target SOL amount required to migrate (OPTIONAL; should be > 85). If user provided quoteRaising he musts provide tokenSuply`
      ).optional(),

      tokenSuply: z.string().describe(
        `Total supply to mint (OPTIONAL; should be > 1,000,000,000). If user provided tokenSuply he musts provide ypu woth quoteRaising`
      ).optional(),
    }),
  }),

  SECURITY_FUNCTION: tool({
    description: `Assess rugpull risk via RugCheck + SolanaTracker.\nWhen to use: safety check for a token before trading.\nOutput: risk score (0–100), category, flags, liquidity breakdown, insider clusters.`,
    parameters: z.object({
      ticker: z.string().min(1).describe(
        `Token symbol or mint to analyze. Examples: "SOL", "8mznFj...pump".`
      ),
    }),
  }),

  HOLDERSCAN_FUNCTION: tool({
    description: `Fetch HolderScan analytics for a token.\nWhen to use: need holder distribution, PnL stats, wallet categories, supply breakdown (if available).`,
    parameters: z.object({
      ticker: z.string().min(1).describe(
        `Token symbol or mint. Prefer mint if available.`
      ),
    }),
  }),

  ANALYZE_WALLET: tool({
    description: `Analyze a Solana wallet via Step Finance.\nWhen to use: you need holdings/liquidity/positions/NFTs etc.\nInput: optional address and modules to focus on. If address omitted, uses the user's wallet.`,
    parameters: z.object({
      address: z.string().min(32).max(64).optional()
        .describe(`Solana wallet address (base58). Optional.`),
      modules: z.array(z.enum([
        "token","liquidity","farm","stake","dex","lend","vault","margin","nft","nftmarket","validator","domain","perp"
      ])).optional().describe(
        `Optional filter for specific Step modules to analyze.`
      ),
    }),
  }),

  LUNAR_KPIS: tool({
    description: `Get LunarCrush social KPIs (mentions, interactions, contributors, dominance) with deltas.\nWhen to use: social momentum snapshot.`,
    parameters: z.object({
      topic: z.string().min(1).describe(`Topic, ticker or name. Examples: "solana", "bonk", "bitcoin".`),
      window: z.enum(["24h","7d"]).optional().describe(`Lookback window. Default: 24h.`),
    }),
  }),

  LUNAR_POSTS: tool({
    description: `Get top LunarCrush social posts for a topic.\nWhen to use: show viral/relevant content.`,
    parameters: z.object({
      topic: z.string().min(1).describe(`Topic, ticker or name.`),
      window: z.enum(["24h","7d"]).optional().describe(`Lookback window. Default: 24h.`),
    }),
  }),

  LUNAR_TOPIC_SERIES: tool({
    description: `Get time series for a topic (interactions, posts, sentiment, price close, social dominance) for charting.\nWhen to use: plot trends.`,
    parameters: z.object({
      topic: z.string().min(1).describe(`Topic, ticker or name.`),
      window: z.enum(["24h","7d"]).optional().describe(`Lookback window. Default: 24h.`),
    }),
  }),

  LUNAR_SUMMARY: tool({
    description: `Summarize last 24h for a topic via LunarCrush (KPIs + notable posts) and coin snapshot when resolvable.\nWhen to use: quick neutral brief + key stats.`,
    parameters: z.object({
      topic: z.string().min(1).describe(
        `Topic, ticker or name. Examples: "solana", "bonk", "bitcoin".`
      ),
    }),
  }),

  ...meteoraPrompts,
  ...kaminoPrompts,
  ...trendingPrompts,

  // Keep missions at the end to avoid name collisions with manual tools.
  ...missionsPrompts,
};