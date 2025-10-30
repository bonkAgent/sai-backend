import type { Express, Request, Response } from "express";
import { lcTopicTimeseries, lcTopicPosts, lcTopicNews, lcPostDetail } from "./client";
import { mapTopicSeries, mapPosts, mapNews, mergePostDetail } from "./mapper";

type WindowStr = "24h" | "48h" | "7d";
const parseWindow = (v: any): WindowStr => {
    const s = String(v ?? "24h").toLowerCase();
    return (s === "48h" || s === "7d") ? (s as WindowStr) : "24h";
};
const windowToHours = (w: WindowStr) => (w === "48h" ? 48 : w === "7d" ? 168 : 24);
const nowSec = () => Math.floor(Date.now() / 1000);
const badReq = (res: Response, msg: string) => res.status(400).json({ error: msg });

function aggregateKpis(series: Array<any>) {
    if (!Array.isArray(series) || !series.length) {
        return {
            mentions: 0,
            interactions: 0,
            contributors: 0,
            contributorsActivePeak: 0,
            sentiment: null as number | null,
            trend: "flat" as "flat" | "up" | "down",
            socialDominanceAvg: null as number | null,
        };
    }
    let mentions = 0, interactions = 0, contributors = 0;
    let peakActive = 0;
    let sentWeighted = 0;
    let domSum = 0, domN = 0;
    for (const p of series) {
        const inter = Number(p?.interactions ?? 0);
        const posts = Number(p?.posts_created ?? 0);
        const contribCreated = Number(p?.contributors_created ?? 0);
        const contribActive = Number(p?.contributors_active ?? 0);
        const sent = (typeof p?.sentiment === "number") ? p.sentiment : null;
        const dom = (typeof p?.social_dominance === "number") ? p.social_dominance : null;
        mentions += posts;
        interactions += inter;
        contributors += contribCreated;
        peakActive = Math.max(peakActive, isFinite(contribActive) ? contribActive : 0);
        if (sent !== null && inter > 0) sentWeighted += (sent / 100) * inter;
        if (dom !== null) { domSum += dom; domN += 1; }
    }
    const q = Math.max(1, Math.floor(series.length / 4));
    const head = series.slice(0, q).reduce((a, b) => a + (b?.interactions ?? 0), 0);
    const tail = series.slice(-q).reduce((a, b) => a + (b?.interactions ?? 0), 0);
    const trend = tail > head * 1.05 ? "up" : tail < head * 0.95 ? "down" : "flat";
    return {
        mentions,
        interactions,
        contributors,
        contributorsActivePeak: peakActive,
        sentiment: interactions ? (sentWeighted / interactions) : null,
        trend,
        socialDominanceAvg: domN ? domSum / domN : null,
    };
}

/**
 * @openapi
 * /api/lunar/intel:
 *   get:
 *     summary: Unified LunarCrush intel endpoint
 *     description: >
 *       Returns aggregated KPIs, hourly time series, top posts (always enriched with detailed metrics),
 *       and top news for a given topic. News data is not filtered by time (per LunarCrush API) and is
 *       limited by count only.
 *     tags:
 *       - LunarCrush
 *     parameters:
 *       - in: query
 *         name: topic
 *         required: true
 *         schema:
 *           type: string
 *         description: Target social topic (lowercase).
 *       - in: query
 *         name: window
 *         schema:
 *           type: string
 *           enum: [24h, 48h, 7d]
 *           default: 24h
 *         description: Aggregation window for KPI and time series.
 *       - in: query
 *         name: limitPosts
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *         description: Number of posts to return.
 *       - in: query
 *         name: limitNews
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 10
 *         description: Number of news items to return.
 *     responses:
 *       200:
 *         description: Successful response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 topic:
 *                   type: string
 *                 window:
 *                   type: string
 *                 asOf:
 *                   type: integer
 *                   description: Unix timestamp (ms) of data generation.
 *                 kpis:
 *                   type: object
 *                   properties:
 *                     mentions: { type: integer }
 *                     interactions: { type: integer }
 *                     contributors: { type: integer }
 *                     contributorsActivePeak: { type: integer }
 *                     sentiment: { type: number, description: "Weighted 0–1 average sentiment" }
 *                     trend: { type: string, enum: [up, down, flat] }
 *                     socialDominanceAvg: { type: number }
 *                 posts:
 *                   type: array
 *                   items:
 *                     type: object
 *                 news:
 *                   type: array
 *                   items:
 *                     type: object
 *                 series:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid or missing parameters.
 *       500:
 *         description: Internal server error.
 */
export function mountLunarIntelRoute(app: Express) {
    app.get("/api/lunar/intel", async (req: Request, res: Response) => {
        const topic = String(req.query.topic || "").trim().toLowerCase();
        if (!topic) return badReq(res, "Missing 'topic'");
        const window = parseWindow(req.query.window);
        const hours = windowToHours(window);
        const limitPosts = clampInt(req.query.limitPosts, 5, 1, 20);
        const limitNews = clampInt(req.query.limitNews, 10, 1, 20);
        const end = nowSec();
        const start = end - hours * 3600;

        try {
            const tsJson = await lcTopicTimeseries(topic, "hour");
            const seriesAll = mapTopicSeries(tsJson);
            const series = seriesAll.filter((p: { t: number }) => p.t >= start * 1000 && p.t <= end * 1000);

            const kpis = aggregateKpis(
                (tsJson?.data ?? []).filter((p: any) => p?.time >= start && p?.time <= end)
            );

            const postsRaw = await lcTopicPosts(topic);
            let posts = mapPosts(postsRaw)
                .filter((p: { createdAt: number }) => typeof p.createdAt === "number" && p.createdAt >= start * 1000 && p.createdAt <= end * 1000)
                .slice(0, limitPosts);
            if (posts.length) {
                posts = await enrichPostsWithDetails(posts);
            }

            const newsRaw = await lcTopicNews(topic);
            const news = mapNews(newsRaw).slice(0, limitNews);

            return res.json({
                topic,
                window,
                asOf: Date.now(),
                kpis: { window, ...kpis },
                posts,
                news,
                series,
            });
        } catch (e: any) {
            console.error("[/api/lunar/intel] error:", e);
            return res.status(500).json({ error: e?.message || "Internal error" });
        }
    });

    console.log(" [LC] Intel route mounted at GET /api/lunar/intel");
}

function clampInt(v: any, def: number, min: number, max: number) {
    const n = Number(v ?? def);
    if (!Number.isFinite(n)) return def;
    return Math.min(Math.max(Math.floor(n), min), max);
}

async function enrichPostsWithDetails(posts: any[]) {
    const CHUNK = 5;
    const out: any[] = [];
    for (let i = 0; i < posts.length; i += CHUNK) {
        const chunk = posts.slice(i, i + CHUNK);
        const details = await Promise.all(chunk.map(async p => {
            try {
                const d = await lcPostDetail(p.type, p.id);
                return mergePostDetail(p, d);
            } catch {
                return p;
            }
        }));
        out.push(...details);
    }
    return out;
}