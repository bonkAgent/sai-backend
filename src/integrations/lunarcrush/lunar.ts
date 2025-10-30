import { lcTopicTimeseries, lcTopicPosts, lcTopicNews } from "./client";
import { mapPosts, mapTopicSeries, mapNews, aggregateKpisFromTimeseries } from "./mapper";
import type { AggKpis, IntelPayload, WindowStr } from "./types";

const HOURS: Record<WindowStr, number> = {
    "24h": 24,
    "48h": 48,
    "7d": 168,
};

function hoursFromWindow(w: WindowStr): number {
    return HOURS[w];
}

export async function getKpisAgg(topic: string, window: WindowStr): Promise<AggKpis> {
    const hours = hoursFromWindow(window);
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - hours * 3600;

    const ts = await lcTopicTimeseries(topic, "hour");
    const inWindow = (ts?.data || []).filter((b: any) => typeof b?.time === "number" && b.time >= startSec && b.time <= endSec);
    const agg = aggregateKpisFromTimeseries(inWindow);

    const buckets = inWindow.slice(-12);
    const sum = (arr: any[], key: string) => arr.reduce((s, b) => s + (b?.[key] || 0), 0);
    const prev6 = sum(buckets.slice(0, 6), "interactions");
    const last6 = sum(buckets.slice(6), "interactions");
    const delta = prev6 > 0 ? (last6 - prev6) / prev6 : 0;
    const trend: AggKpis["trend"] = delta > 0.15 ? "up" : delta < -0.15 ? "down" : "flat";

    return {
        window,
        mentions: agg.mentions ?? null,
        interactions: agg.interactions ?? null,
        contributors: agg.contributors ?? null,
        contributorsActivePeak: agg.contributorsActivePeak ?? null,
        sentiment: agg.sentiment ?? null, // 0..1
        trend,
    };
}

export async function getIntel(topic: string, window: WindowStr): Promise<IntelPayload> {
    const hours = hoursFromWindow(window);
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - hours * 3600;

    const [kpis, postsRaw, tsRaw, newsRaw] = await Promise.all([
        getKpisAgg(topic, window).catch(() => null),
        lcTopicPosts(topic).catch(() => ({ data: [] })),
        lcTopicTimeseries(topic, "hour").catch(() => ({ data: [] })),
        lcTopicNews(topic).catch(() => ({ data: [] })),
    ]);

    const seriesAll = mapTopicSeries(tsRaw);
    const series = seriesAll.filter((p: { t: number }) => p.t >= startSec * 1000 && p.t <= endSec * 1000);

    const postsAll = mapPosts(postsRaw);
    const posts = postsAll.filter((p: { createdAt: number | null }) =>
        typeof p.createdAt === "number" && p.createdAt >= startSec * 1000 && p.createdAt <= endSec * 1000
    );

    const news = mapNews(newsRaw);

    const kpisMeta = {
        window,
        notes: {
            mentions: `${hours}h mentions = sum of posts_created across hourly buckets`,
            interactions: `${hours}h interactions = sum across hourly buckets`,
            contributors: `${hours}h contributors = sum of new authors across buckets`,
            activePeak: "max active contributors in any single hour within the window",
            sentiment: `${hours}h interactions-weighted average (0..1)`,
        },
    };

    return {
        topic,
        window,
        asOf: Date.now(),
        kpis,
        kpisMeta,
        posts,
        series,
        news,
    };
}