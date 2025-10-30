import { getKpisAgg, getIntel } from "./lunar";
import {lcTopicPosts, lcTopicTimeseries, lcTopicNews} from "./client";
import {mapPosts, mapTopicSeries, mapNews} from "./mapper";
import type {AggKpis, WindowStr} from "./types";

function normTopic(t: string) {
    return (t || "").trim().replace(/^\$/, "").toLowerCase();
}
const parseWindow = (w?: WindowStr): WindowStr => (w === "7d" ? "7d" : "24h");

export const LUNAR_TOOLS = {
    LUNAR_KPIS: async (args: { topic: string; window?: WindowStr }) => {
        const topic = normTopic(args.topic);
        const window = parseWindow(args.window);
        const kpis = await getKpisAgg(topic, window);
        return {resForAi: {kpis}};
    },

    LUNAR_POSTS: async (args: { topic: string; window?: WindowStr }) => {
        const topic = normTopic(args.topic);
        const window = parseWindow(args.window);
        const now = Math.floor(Date.now() / 1000);
        const start = now - (window === "7d" ? 7 * 24 * 3600 : 24 * 3600);
        const raw = await lcTopicPosts(topic);
        return {resForAi: {posts: mapPosts(raw)}};
    },


    LUNAR_NEWS: async (args: { topic: string }) => {
        const topic = (args.topic || "").trim().toLowerCase();
        const raw = await lcTopicNews(topic);
        return {resForAi: {news: mapNews(raw)}};
    },

    LUNAR_TOPIC_SERIES: async (args: { topic: string; window?: WindowStr }) => {
        const topic = normTopic(args.topic);
        const window = parseWindow(args.window);
        const now = Math.floor(Date.now() / 1000);
        const start = now - (window === "7d" ? 7 * 24 * 3600 : 24 * 3600);
        const raw = await lcTopicTimeseries(topic, "hour");
        return {resForAi: {series: mapTopicSeries(raw)}};
    },

    LUNAR_INTEL: async (args: { topic: string; window?: WindowStr }) => {
        const topic = normTopic(args.topic);
        const window = parseWindow(args.window);
        const intel = await getIntel(topic, window);
        return {resForAi: {intel}};
    },

    LUNAR_SUMMARY: async (args: { topic: string; window?: WindowStr }) => {
        const topic  = normTopic(args.topic);
        const window = parseWindow(args.window);

        const intel = await getIntel(topic, window);

        const k = intel?.kpis ?? null;
        const posts = Array.isArray(intel?.posts) ? intel.posts.slice(0, 5) : [];
        const series = Array.isArray(intel?.series) ? intel.series : [];

        const fmtInt = (n: number | null | undefined) =>
            typeof n === "number" && isFinite(n) ? n.toLocaleString() : "—";
        const fmtPct = (n: number | null | undefined, d = 1) =>
            typeof n === "number" && isFinite(n) ? `${n.toFixed(d)}%` : "—";
        const cut = (s: string, max = 140) =>
            (s || "").replace(/\s+/g, " ").trim().slice(0, max) + ((s || "").length > max ? "…" : "");

        const mentions   = typeof k?.mentions === "number" ? k.mentions : null;
        const inter      = typeof k?.interactions === "number" ? k.interactions : null;
        const peakActive = typeof k?.contributorsActivePeak === "number" ? k.contributorsActivePeak : null;
        const sent01     = typeof k?.sentiment === "number" ? k.sentiment : null; // 0..1
        const sentPct    = sent01 != null ? sent01 * 100 : null;
        const trend      = k?.trend ?? null;

        const engPerPost =
            mentions && mentions > 0 && typeof inter === "number" ? inter / mentions : null;
        const activesPerPostAtPeak =
            mentions && mentions > 0 && typeof peakActive === "number" ? peakActive / mentions : null;

        const sentClass =
            sent01 == null ? "unknown" : sent01 >= 0.60 ? "bullish" : sent01 <= 0.40 ? "bearish" : "neutral";

        const interSeries = series
            .map(p => (typeof p.interactions === "number" ? p.interactions : null))
            .filter((n): n is number => typeof n === "number" && isFinite(n));
        const sentSeries = series
            .map(p => (typeof p.sentiment === "number" ? p.sentiment : null))
            .filter((n): n is number => typeof n === "number" && isFinite(n));

        function slope(arr: number[]): number | null {
            const n = arr.length;
            if (n < 3) return null;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (let i = 0; i < n; i++) {
                sumX  += i;
                sumY  += arr[i];
                sumXY += i * arr[i];
                sumX2 += i * i;
            }
            const denom = n * sumX2 - sumX * sumX;
            if (denom === 0) return null;
            return (n * sumXY - sumX * sumY) / denom;
        }

        function halfDelta(arr: number[]): number | null {
            const n = arr.length;
            if (n < 4) return null;
            const mid = (n / 2) | 0;
            const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
            return avg(arr.slice(mid)) - avg(arr.slice(0, mid));
        }

        function std(arr: number[]): number | null {
            const n = arr.length;
            if (n < 3) return null;
            const m = arr.reduce((s, v) => s + v, 0) / n;
            const v = arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (n - 1);
            return Math.sqrt(v);
        }

        const interSlope   = interSeries.length ? slope(interSeries) : null;
        const interAccel   = interSeries.length ? halfDelta(interSeries) : null;
        const sentStability = sentSeries.length ? std(sentSeries) : null;

        const slopeView =
            interSlope == null
                ? "flow unclear"
                : interSlope > 0
                    ? "rising flow"
                    : interSlope < 0
                        ? "easing flow"
                        : "flat flow";

        const accelView =
            interAccel == null
                ? "no clear acceleration"
                : interAccel > 0
                    ? "engagement accelerated vs. earlier in the window"
                    : "engagement decelerated vs. earlier in the window";

        const stabView =
            sentStability == null
                ? "tone variability n/a"
                : sentStability <= 5
                    ? "tone stable"
                    : sentStability <= 12
                        ? "tone moderately variable"
                        : "tone volatile";

        const topTotal = posts
            .map(p => (typeof p?.metrics?.total === "number" ? p.metrics.total : 0))
            .reduce((s, v) => s + (isFinite(v) ? v : 0), 0);
        const concentration =
            typeof inter === "number" && inter > 0 ? Math.min(1, topTotal / inter) : null;
        const concView =
            concentration == null
                ? null
                : concentration >= 0.5
                    ? "conversation concentrated in a few viral posts"
                    : concentration >= 0.25
                        ? "balanced with several strong posts"
                        : "broadly distributed beyond the top posts";

        const keywords = new Set<string>();
        for (const p of posts) {
            const src = (p?.title || "").toLowerCase();
            [
                "listing","partnership","integration","airdrop","buyback","burn",
                "hack","exploit","migration","acquisition","funding","roadmap",
                "update","testnet","mainnet",
            ].forEach(kw => { if (src.includes(kw)) keywords.add(kw); });
        }
        const themeLine = keywords.size ? `Themes: ${Array.from(keywords).slice(0,4).join(", ")}.` : null;

        const briefA =
            sentClass === "bullish"
                ? "Positive social tone with healthy engagement."
                : sentClass === "bearish"
                    ? "Cautious/negative social tone; watch participation breadth."
                    : "Mixed/neutral social tone.";
        const briefB = trend ? `Panel trend tag: ${trend}.` : "Momentum tag is inconclusive from the panel.";
        const briefC = `Flow: ${slopeView}; ${accelView}; ${stabView}.`;

        let opinion =
            "Signals point to short-term sentiment/flow dynamics; not a valuation model.";
        if (engPerPost != null && sentPct != null) {
            if (engPerPost >= 600 && sentPct >= 60) {
                opinion =
                    "Engagement density and tone are supportive; a near-term push is plausible if headlines persist, but sharp post-spike mean-reversion is common.";
            } else if (engPerPost < 120 && sentPct <= 45) {
                opinion =
                    "Low engagement density with cautious tone — momentum likely headline-dependent; sustained move needs external catalysts.";
            }
        }
        if (concView) {
            opinion += ` Also, ${concView}; concentrated flows tend to fade faster.`;
        }

        const lines: string[] = [];
        lines.push(`🐶 ${topic.toUpperCase()} — ${window} LunarCrush Summary`);
        lines.push(`${briefA} ${briefB} ${briefC}${themeLine ? " " + themeLine : ""}`);
        lines.push("");
        lines.push("📊 Key Metrics:");
        lines.push(`• Mentions: ${fmtInt(mentions)} (baseline for ratios)`);
        lines.push(
            `• Interactions: ${fmtInt(inter)}${
                engPerPost != null ? ` — avg ~${Math.round(engPerPost).toLocaleString()} per post` : ""
            }`
        );
        lines.push(
            `• Active contributors (peak): ${fmtInt(peakActive)}${
                activesPerPostAtPeak != null ? ` (~${activesPerPostAtPeak.toFixed(2)} per post at peak)` : ""
            }`
        );
        if (sentPct != null) lines.push(`• Sentiment (interaction-weighted): ${fmtPct(sentPct, 1)} — ${sentClass}`);
        if (concentration != null) lines.push(`• Top-post share vs KPI interactions: ${fmtPct(concentration * 100, 1)} (concentration read)`);

        if (posts.length) {
            lines.push("");
            lines.push("📰 Top posts (signals, not endorsements):");
            for (const p of posts) {
                const title = cut(p?.title || "");
                lines.push(`• ${title}${p?.url ? ` — ${p.url}` : ""}`);
            }
        }

        lines.push("");
        lines.push(`⚠️ Opinion/Risk: ${opinion}`);

        const text = lines.join("\n");

        const res = {
            topic,
            window,
            kpis: {
                mentions, interactions: inter, contributorsActivePeak: peakActive,
                sentiment: sentPct, trend, engagementPerPost: engPerPost, activesPerPostAtPeak,
                sentimentClass: sentClass,
            },
            analytics: {
                slope: interSlope, accel: interAccel, stability: sentStability,
                slopeView, accelView, stabView,
                concentration, concView,
                themes: themeLine,
            },
            posts: posts.map(p => ({
                id: p.id,
                title: cut(p?.title || ""),
                url: p.url,
                metrics: p.metrics,
            })),
            opinion,
            summaryText: `🐶 ${topic.toUpperCase()} — ${window} LunarCrush Summary
                Tone: ${sentClass}, trend: ${trend || "n/a"}.
                Flow: ${slopeView}; ${accelView}; ${stabView}.
                Mentions ${fmtInt(mentions)}, interactions ${fmtInt(inter)}, peak actives ${fmtInt(peakActive)}, sentiment ${fmtPct(sentPct)}.
                Opinion: ${opinion}`,
        };

        return {
            resForAi: res,
        };
    },
};