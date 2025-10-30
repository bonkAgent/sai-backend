import express, { Request, Response } from "express";
import "dotenv/config";
import { KeypairWallet} from "solana-agent-kit";
import { chatWithSolanaAgentStream } from "./services/solanaService";
import { getKaelusPrivateKey, getPrivyUser, start } from "./services/privyService";
import {getFriends, getBalances, getActivity} from "./services/mongoService";
import { getKaelusBalance, getPhantomBalance, transaction } from "./services/sidePanelService";
import { mainLoop } from "./missions/worker";
import { mountLunarIntelRoute } from "./integrations/lunarcrush/routes";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger";
import { aC } from "@upstash/redis/zmscore-CgRD7oFR";
import { TOOL_HANDLERS } from "./promtsAI/tool-handlers";
import {buildKaminoCreditBureau} from "./integrations/kamino/panel";
import {getTrendingStatus} from "./integrations/solanatracker/trendingTool";
import {
    corsStrict,
    hardenHeaders,
    preventParamPollution,
    preventMongoInjection,
    limiterGlobal,
    limiterChat,
    limiterTransfer,
} from "./security"
import type { NextFunction } from "express";
import {DEFAULT_CLUSTER, KAMINO_MAIN_MARKET} from "./integrations/kamino/constants";

mainLoop().catch(err => {
  console.log(err);
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(hardenHeaders);
app.use(corsStrict);
app.use(preventParamPollution);
// app.use(preventMongoInjection);
app.use(express.json({ limit: "500kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(limiterGlobal);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
}));
app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));


app.use((req, res, next) => {
  console.log(`📥 [REQUEST] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 [REQUEST] Body keys:`, Object.keys(req.body));
  }
  next();
});

const inFlightByClient = new Map<string, number>();
const MAX_CHAT_CONCURRENCY = Number(process.env.MAX_CHAT_CONCURRENCY ?? 2);

const clientKeyFromReq = (req: Request): string => {
    const auth = req.headers.authorization ?? "";
    if (auth.startsWith("Bearer ")) return "tok:" + auth.slice(7);
    return "ip:" + (req.ip || (req.socket as any)?.remoteAddress || "unknown");
};

const chatConcurrencyGuard = (req: Request, res: Response, next: NextFunction) => {
    const key = clientKeyFromReq(req);
    const current = inFlightByClient.get(key) ?? 0;

    if (current >= MAX_CHAT_CONCURRENCY) {
        res.setHeader("Retry-After", "1");
        res.status(429).type("text/event-stream");
        res.write(`data: ${JSON.stringify({ error: "too_many_streams", isComplete: true })}\n\n`);
        return res.end();
    }

    inFlightByClient.set(key, current + 1);

    const release = () => {
        const val = inFlightByClient.get(key) ?? 1;
        const nextVal = Math.max(0, val - 1);
        if (nextVal === 0) inFlightByClient.delete(key);
        else inFlightByClient.set(key, nextVal);
    };

    res.on("close", release);
    res.on("finish", release);
    next();
};

/**
 * @openapi
 * /api/chat:
 *   post:
 *     summary: Streaming chat with the Solana agent (SSE)
 *     description: Returns a Server-Sent Events (SSE) stream containing model response chunks and tool events.
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               msg: { type: string }
 *               priorityFee: { type: number, default: 0 }
 *               history: { type: array, items: { type: object } }
 *               friends: { type: array, items: { type: object } }
 *             required: [msg]
 *     responses:
 *       200:
 *         description: >
 *           SSE stream (content-type: "text/event-stream").
 *           Each line follows the format "data: <JSON>\n\n".
 *           For tool events, the JSON object includes:
 *           - type: "tool"
 *           - tool: object containing all fields from resForStatus plus toolName.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: >
 *                 Lines in the format "data: <JSON according to components.schemas.SSEMessage>\n\n"
 *             examples:
 *               toolEvent:
 *                 summary: Tool event
 *                 value: |
 *                   data: {
 *                     "tool": {
 *                       "status": "success",
 *                       "id": "5Z...",
 *                       "amountFrom": 1.23,
 *                       "from": { "symbol":"SOL","address":"...","logoURI":"..." },
 *                       "amountTo": 25.7,
 *                       "to": { "symbol":"USDC","address":"...","logoURI":"..." },
 *                       "toolName": "SWAP"
 *                     },
 *                     "type": "tool"
 *                   }\n\n
 *               delta:
 *                 summary: Text delta chunk
 *                 value: |
 *                   data: {"type":"delta","content":"part of the response","isComplete":false}\n\n
 *               completion:
 *                 summary: Final event
 *                 value: |
 *                   data: {"type":"completion","content":"","isComplete":true,"fullContent":"..."}\n\n
 *       400:
 *         description: Bad request (missing token or prompt).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
app.post("/api/chat", limiterChat, chatConcurrencyGuard, async (req: Request, res: Response): Promise<void> => {
  const { msg, priorityFee = 0, history, friends } = req.body;
  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    res.status(400).json({ error: "Missing token" });
    return;
  }
  if (!msg) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  try {
    const user = await getPrivyUser(accessToken);
    const tokens = await getBalances(user)
    const keypair = await getKaelusPrivateKey(user);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.flushHeaders?.();

    const onTool = (payload: any) => {
      try {
        const evt = { type: "tool", tool: payload };
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      } catch (e) {
        console.log("onTool write error:", e);
      }
    };


    const stream = await chatWithSolanaAgentStream(
        msg,
        keypair,
        user,
        history,
        friends,
        tokens,
        priorityFee,
        onTool
    );


    let fullResponse = "";
    let sentChunks = 0;

    const writeChunk = (text: string) => {
      if (!text) return;
      sentChunks++;
      fullResponse += text;
      const payload = JSON.stringify({ content: text, isComplete: false });
      res.write(`data: ${payload}\n\n`);
    };
    let streamed = false;

    try {
      if (stream.textStream && stream.textStream[Symbol.asyncIterator]) {
        streamed = true;
        for await (const delta of stream.textStream as AsyncIterable<string>) {
          writeChunk(delta);
        }
      }
    } catch (err){console.log(err)}

    if (!streamed) {
      try {
        if (stream.fullStream && stream.fullStream[Symbol.asyncIterator]) {
          streamed = true;
          for await (const part of stream.fullStream as AsyncIterable<any>) {
            if (part?.type === "text-delta" && typeof part.textDelta === "string") {
              writeChunk(part.textDelta);
            }
          }
        }
      } catch {}
    }

    try {
      if (typeof stream.flushStatuses === "function") {
        await stream.flushStatuses(fullResponse);
      }
    } catch (err){console.log(err)}
    const completionData = JSON.stringify({ content: "", isComplete: true, fullContent: fullResponse });
    res.write(`data: ${completionData}\n\n`);
    res.end();
  } catch (err: any) {
    try {
      console.log(err)
      const errorData = JSON.stringify({ error: "Internal error", isComplete: true });
      res.write(`data: ${errorData}\n\n`);
    } catch (err){console.log(err)}
    res.end();
  }
});

/**
 * @openapi
 * /api/sidepanel/balance:
 *   get:
 *     summary: Phantom & Kaelus wallet balances (with portfolio valuation)
 *     description: |
 *       Returns the current Phantom balance in SOL (as a string) and a detailed Kaelus portfolio
 *       valuation: total value in USD and a token breakdown with price and value.
 *     tags: [Sidepanel]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BalanceResponse'
 *             examples:
 *               success:
 *                 value:
 *                   phantomBalance: "0.423519"
 *                   kaelusBalance:
 *                     totalUsd: 1523.77
 *                     tokens:
 *                       - symbol: "SOL"
 *                         address: "So11111111111111111111111111111111111111112"
 *                         name: "Solana"
 *                         balance: 1.23456789
 *                         priceUsd: 185.21
 *                         valueUsd: 228.64
 *                         logoURI: "https://res.coinpaper.com/coinpaper/solana_sol_logo_32f9962968.png"
 *                       - symbol: "JitoSOL"
 *                         address: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"
 *                         name: "Jito Staked SOL"
 *                         balance: 3.5
 *                         priceUsd: 188.02
 *                         valueUsd: 658.07
 *       400:
 *         description: Missing token (Bearer)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missingToken:
 *                 value: { "error": "Missing token" }
 *       500:
 *         description: Internal error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               internal:
 *                 value: { "error": "Internal error" }
 */

app.get("/api/sidepanel/balance", async (req: Request, res: Response): Promise<void> => {
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) { res.status(400).json({ error: "Missing token" }); return; }

    try {
        const user = await getPrivyUser(accessToken);
        const keypair = await getKaelusPrivateKey(user);

        const phantomBalance = await getPhantomBalance(user);

        const kaelusPortfolio = await getKaelusBalance(keypair, user);

        res.json({
            phantomBalance,
            kaelusBalance: kaelusPortfolio
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal error" });
    }
});

/**
 * @openapi
 * /api/sidepanel/transfer:
 *   post:
 *     summary: Transfer funds
 *     tags: [Sidepanel]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TransferRequest' }
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/schemas/TransferResponseKaelus'
 *               - $ref: '#/components/schemas/TransferResponsePhantom'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
app.post("/api/sidepanel/transfer",limiterTransfer, async (req: Request, res: Response): Promise<void> => {
  const { amount, from, publicKey, priorityFee = 0 } = req.body;
  if (!amount || !from|| !publicKey) {res.status(400).json({ error: "Missing smth" }); return;}
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {res.status(400).json({ error: "Missing token" }); return;}

  try {
    if(from === "kaelus"){
      const user = await getPrivyUser(accessToken);
      const keypair = await getKaelusPrivateKey(user);
      await transaction(keypair, publicKey, amount, priorityFee);
      res.json( { status:"ok" });
    }else if(from === "phantom"){
      const user = await getPrivyUser(accessToken);
      const keypair = await getKaelusPrivateKey(user);
      const wallet = new KeypairWallet(keypair, process.env.RPC_URL!);
      res.json( { publicKey: wallet.publicKey });
    }else{
      res.status(400).json({ error: "To who?" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * @openapi
 * /api/sidepanel/getFriends:
 *   get:
 *     summary: Get user's friends list
 *     tags: [Sidepanel]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/FriendsResponse' }
 *       400:
 *         description: Missing token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
app.get("/api/sidepanel/getFriends", async (req: Request, res: Response): Promise<void> => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {res.status(400).json({ error: "Missing token" }); return;}

  try {
    const user = await getPrivyUser(accessToken);
    res.status(200).json(await getFriends(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

mountLunarIntelRoute(app);


/**
 * @openapi
 * /api/market/trending:
 *   get:
 *     summary: Trending tokens on Solana
 *     tags:
 *       - Market
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [5m, 15m, 30m, 1h, 6h, 12h, 24h]
 *         description: "Lookback window (default: 1h)"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 5
 *         description: "How many items to return"
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrendingResponse'
 */
app.get("/api/market/trending", async (req, res) => {
    try {
        const timeframe = (req.query.timeframe as
            | "5m" | "15m" | "30m" | "1h" | "6h" | "12h" | "24h") ?? "1h";

        const rawLimit = Number(req.query.limit ?? 5);
        const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 5, 1), 50);

        const payload = await getTrendingStatus(timeframe, limit);
        res.json(payload);
    } catch (e) {
        console.error("[/api/market/trending] error:", e);
        res.status(500).json({ error: "Failed to fetch trending tokens" });
    }
});


/**
 * @openapi
 * /api/activity:
 *   get:
 *     summary: User activity history
 *     tags: [Activity]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, minimum: 1, maximum: 200 }
 *         description: Maximum number of activity records to return
 *       - in: query
 *         name: success
 *         schema: { type: string, enum: ["true", "false"] }
 *         description: Filter by success flag
 *       - in: query
 *         name: tools
 *         schema: { type: string }
 *         description: Comma-separated list of tools to filter by
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ActivityResponse' }
 *       400:
 *         description: Missing token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
app.get("/api/activity", async (req: Request, res: Response): Promise<void> => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) { res.status(400).json({ error: "Missing token" }); return; }

  try {
    const user = await getPrivyUser(accessToken);
    const limit  = req.query.limit ? Number(req.query.limit) : 50;
    const successQ = (req.query.success === "true") ? true : (req.query.success === "false" ? false : undefined);
    const tools = typeof req.query.tools === "string" ? (req.query.tools as string).split(",") : undefined;

    const items = await getActivity(user, { limit, tools, success: successQ as any });
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/sidepanel/meteoraPools", async (req: Request, res: Response): Promise<void> => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {res.status(400).json({ error: "Missing token" }); return;}

  try {
    const user = await getPrivyUser(accessToken);
    const smth = (await TOOL_HANDLERS.GET_TOP_METEORA_POOLS({})).resForAi;
    res.json(smth);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/start", async (req: Request, res: Response): Promise<void> => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {res.status(400).json({ error: "Missing token" }); return;}

  try {
    const user = await getPrivyUser(accessToken);
    const smth = await start(user);
    if(smth.new === false){
      res.json({publicKey: smth.keypair.publicKey, privateKey: null, new: false});
    }else{
      res.json({publicKey: smth.keypair.publicKey, privateKey: smth.keypair.privateKey, new: true});
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/sidepanel/meteoraPositions", async (req: Request, res: Response): Promise<void> => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {res.status(400).json({ error: "Missing token" }); return;}

  try {
    const user = await getPrivyUser(accessToken);
    const keypair = await getKaelusPrivateKey(user);
    const smth = (await TOOL_HANDLERS.GET_METEORA_POSITIONS({}, keypair, user)).resForAi;
    res.json(smth);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/sidepanel/missions", async (req: Request, res: Response): Promise<void> => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  if (!accessToken) {res.status(400).json({ error: "Missing token" }); return;}

  try {
    const user = await getPrivyUser(accessToken);
    const keypair = await getKaelusPrivateKey(user);
    const smth = (await TOOL_HANDLERS.GET_MISSIONS({toDelete: false}, keypair, user)).resForAi;
    res.json(smth);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});



/**
 * @openapi
 * /api/sidepanel/kamino/credit-bureau:
 *   get:
 *     summary: Kamino Credit Bureau - asset table with liquidation metrics
 *     description: >
 *       Returns Kamino Finance asset data with liquidation LTV, Supply/Borrow APY, and volume metrics.
 *       Data is fetched from the Kamino API and shows all assets with their liquidation thresholds
 *       to help assess portfolio risk exposure.
 *     tags: [Sidepanel]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: market
 *         schema: { type: string, default: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF" }
 *         description: "Kamino market address (default: main market)"
 *       - in: query
 *         name: env
 *         schema: { type: string, enum: [mainnet-beta, devnet], default: mainnet-beta }
 *         description: "Solana cluster environment"
 *     responses:
 *       200:
 *         description: Successful response with Credit Bureau data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 market:
 *                   type: string
 *                   example: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"
 *                 rows:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       symbol:
 *                         type: string
 *                         example: "SOL"
 *                       mint:
 *                         type: string
 *                         example: "So11111111111111111111111111111111111111112"
 *                       logoURI:
 *                         type: string
 *                         example: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
 *                       totalSupplyUsd:
 *                         type: number
 *                         example: 727296892.33
 *                       totalBorrowUsd:
 *                         type: number
 *                         example: 548923180.89
 *                       liqLtv:
 *                         type: number
 *                         nullable: true
 *                         example: 74
 *                         description: "Liquidation LTV threshold in percentage"
 *                       supplyApy:
 *                         type: number
 *                         nullable: true
 *                         example: 3.5
 *                         description: "Supply APY in percentage"
 *                       borrowApy:
 *                         type: number
 *                         nullable: true
 *                         example: 5.52
 *                         description: "Borrow APY in percentage"
 *                 asOf:
 *                   type: integer
 *                   example: 1730000000000
 *                   description: "Timestamp when data was fetched"
 *                 asOfIso:
 *                   type: string
 *                   example: "2025-10-26T00:00:00.000Z"
 *                   description: "ISO timestamp when data was fetched"
 *             examples:
 *               success:
 *                 summary: Successful response
 *                 value:
 *                   market: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"
 *                   rows:
 *                     - symbol: "SOL"
 *                       mint: "So11111111111111111111111111111111111111112"
 *                       logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
 *                       totalSupplyUsd: 727296892.33
 *                       totalBorrowUsd: 548923180.89
 *                       liqLtv: 74
 *                       supplyApy: 3.5
 *                       borrowApy: 5.52
 *                   asOf: 1730000000000
 *                   asOfIso: "2025-10-26T00:00:00.000Z"
 *       400:
 *         description: Missing authorization token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missingToken:
 *                 value: { "error": "Missing token" }
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               internalError:
 *                 value: { "error": "Internal error" }
 */
app.get("/api/sidepanel/kamino/credit-bureau", async (req, res) => {
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) return res.status(400).json({ error: "Missing token" });

    try {
        const market = typeof req.query.market === "string" && req.query.market.trim()
            ? req.query.market.trim()
            : KAMINO_MAIN_MARKET;
        const env = req.query.env === "devnet" ? "devnet" : "mainnet-beta";

        const payload = await buildKaminoCreditBureau({ market, env });
        res.json(payload);
    } catch (err: any) {
        console.error("[KAMINO_CREDIT_BUREAU] error:", err);
        res.status(500).json({ error: err?.message || "Internal error" });
    }
});

app.listen(PORT, () => {
  console.log(" [SERVER] ========================================");
  console.log(" [SERVER] Solana Agent Chat Server activated!");
  console.log(" [SERVER] ========================================");
  console.log(` [SERVER] Server running: http://localhost:${PORT}`);
  console.log(` [SERVER] Swagger UI:   http://localhost:${PORT}/api-docs`);
  console.log(" [SERVER] SSE (Server-Sent Events) ready (for streaming)");
  console.log(" [SERVER] ========================================");
});