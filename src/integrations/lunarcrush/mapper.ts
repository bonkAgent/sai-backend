export function mapTopicSeries(tsJson: any) {
    const rows = Array.isArray(tsJson?.data) ? tsJson.data : [];
    return rows.map((r: any) => ({
        t: (typeof r?.time === "number" ? r.time : 0) * 1000,  // ms
        interactions: num(r?.interactions),
        posts_created: num(r?.posts_created),
        contributors_active: num(r?.contributors_active),
        sentiment: num(r?.sentiment),
        social_dominance: val(r?.social_dominance),
        close: val(r?.close),
    }));
}

export function mapPosts(postsJson: any) {
    const rows = Array.isArray(postsJson?.data) ? postsJson.data : [];
    return rows.map((p: any) => {
        const id = String(p?.id ?? "");
        const type = String(p?.post_type ?? p?.type ?? "tweet");
        const createdSec =
            typeof p?.post_created === "number" ? p.post_created :
                typeof p?.created === "number" ? p.created :
                    null;
        const createdAt = createdSec ? createdSec * 1000 : null;

        const total = num(p?.interactions_total ?? p?.metrics?.total);

        return {
            id,
            type,
            title: str(p?.post_title ?? p?.title),
            url: str(p?.post_link ?? p?.url),
            createdAt,
            image: p?.post_image ? { src: p.post_image, width: null, height: null } : null,
            creator: {
                id: str(p?.creator_id),
                handle: str(p?.creator_name),
                display: str(p?.creator_display_name ?? p?.creator_name),
                avatar: str(p?.creator_avatar),
                followers: num(p?.creator_followers),
            },
            sentiment: p?.post_sentiment ?? p?.sentiment ?? null,
            metrics: {
                total,
                likes: null, replies: null, retweets: null, quotes: null, views: null, bookmarks: null,
            },
        };
    });
}

export function mapNews(newsJson: any) {
    const rows = Array.isArray(newsJson?.data) ? newsJson.data : [];
    return rows.map((n: any) => ({
        id: String(n?.id ?? ""),
        type: "news",
        title: str(n?.post_title),
        url: str(n?.post_link),
        createdAt: typeof n?.post_created === "number" ? n.post_created * 1000 : null, // ms
        image: n?.post_image ? { src: n.post_image, width: null, height: null } : null,
        outlet: {
            handle: str(n?.creator_name),
            display: str(n?.creator_display_name ?? n?.creator_name),
            followers: num(n?.creator_followers),
            avatar: str(n?.creator_avatar),
        },
        sentiment: n?.post_sentiment ?? null,
        interactions_24h: n?.interactions_24h ?? null,
        interactions_total: n?.interactions_total ?? null,
    }));
}

export function mergePostDetail(base: any, detail: any) {
    const m = detail?.metrics ?? {};
    return {
        ...base,
        metrics: {
            total: isNum(base?.metrics?.total) ? base.metrics.total : null,
            likes: pickNum(m?.favorites),
            replies: pickNum(m?.replies),
            retweets: pickNum(m?.retweets),
            quotes: pickNum(m?.quotes),
            views: pickNum(m?.views),
            bookmarks: pickNum(m?.bookmarks),
        },
    };
}

export function aggregateKpisFromTimeseries(rows: any[]) {
    if (!Array.isArray(rows) || !rows.length) {
        return {
            mentions: 0,
            interactions: 0,
            contributors: 0,
            contributorsActivePeak: 0,
            sentiment: null as number | null,
            socialDominanceAvg: null as number | null,
        };
    }
    let mentions = 0, interactions = 0, contributors = 0;
    let peakActive = 0;
    let sentWeighted = 0, interSumForSent = 0;
    let domSum = 0, domN = 0;

    for (const p of rows) {
        const inter = typeof p?.interactions === "number" ? p.interactions : 0;
        const posts = typeof p?.posts_created === "number" ? p.posts_created : 0;
        const contribCreated = typeof p?.contributors_created === "number" ? p.contributors_created : 0;
        const contribActive = typeof p?.contributors_active === "number" ? p.contributors_active : 0;
        const sent = typeof p?.sentiment === "number" ? p.sentiment : null; // 0..100 per LC
        const dom = typeof p?.social_dominance === "number" ? p.social_dominance : null;

        mentions += posts;
        interactions += inter;
        contributors += contribCreated;
        peakActive = Math.max(peakActive, contribActive || 0);

        if (sent !== null && inter > 0) {
            sentWeighted += (sent / 100) * inter;
            interSumForSent += inter;
        }
        if (dom !== null) { domSum += dom; domN += 1; }
    }

    return {
        mentions,
        interactions,
        contributors,
        contributorsActivePeak: peakActive,
        sentiment: interSumForSent ? sentWeighted / interSumForSent : null, // 0..1
        socialDominanceAvg: domN ? domSum / domN : null,
    };
}

// helpers
const num = (v: any) => (typeof v === "number" && isFinite(v)) ? v : 0;
const val = (v: any) => (typeof v === "number" && isFinite(v)) ? v : null;
const str = (v: any) => (typeof v === "string" ? v : "");
const isNum = (v: any) => typeof v === "number" && isFinite(v);
const pickNum = (v: any) => (typeof v === "number" && isFinite(v)) ? v : null;