export type WindowStr = "24h" | "48h" | "7d";

export interface AggKpis {
    window: WindowStr;
    mentions: number | null;
    interactions: number | null;
    contributors: number | null;
    contributorsActivePeak: number | null;
    sentiment: number | null;
    trend: "up" | "down" | "flat";
}

export interface IntelPayload {
    topic: string;
    window: WindowStr;
    asOf: number;
    kpis: AggKpis | null;
    kpisMeta: any;
    posts: any[];
    series: any[];
    news: any[];
}

export interface IntelSeriesPoint {
    t: number;
    interactions: number | null;
    posts_created: number | null;
    contributors_active: number | null;
    sentiment: number | null;
    social_dominance: number | null;
    close: number | null;
}
