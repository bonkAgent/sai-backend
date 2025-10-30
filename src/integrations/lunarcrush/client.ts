import fetch from "node-fetch";

const LC_BASE = process.env.LC_BASE || "https://lunarcrush.com/api4";
const LC_TOKEN = process.env.LUNARCRUSH_API_KEY || process.env.LC_TOKEN || "undefined";

const headers = () => ({
    "Authorization": `Bearer ${LC_TOKEN}`,
    "Content-Type": "application/json",
});

const toQuery = (q: Record<string, any>) =>
    Object.entries(q)
        .filter(([,v]) => v !== undefined && v !== null && v !== "")
        .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");


export async function lcTopicTimeseries(topic: string, bucket: "hour"|"day" = "hour") {
    const url = `${LC_BASE}/public/topic/${encodeURIComponent(topic)}/time-series/v2?${toQuery({ bucket })}`;
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error(`LC time-series: ${r.status} ${r.statusText}`);
    return r.json();
}

export async function lcTopicPosts(topic: string) {
    const url = `${LC_BASE}/public/topic/${encodeURIComponent(topic)}/posts/v1`;
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error(`LC topic posts: ${r.status} ${r.statusText}`);
    return r.json();
}

export async function lcTopicNews(topic: string) {
    const url = `${LC_BASE}/public/topic/${encodeURIComponent(topic)}/news/v1`;
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error(`LC topic news: ${r.status} ${r.statusText}`);
    return r.json();
}

export async function lcPostDetail(postType: string, postId: string) {
    const url = `${LC_BASE}/public/posts/${encodeURIComponent(postType)}/${encodeURIComponent(postId)}/v1`;
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error(`LC post detail: ${r.status} ${r.statusText}`);
    return r.json();
}