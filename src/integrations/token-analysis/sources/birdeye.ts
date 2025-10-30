import fetch from 'node-fetch';

export type BirdeyeTokenData = {
    name: string | null;
    symbol: string | null;
    address: string;
    logoURI?: string | null;

    priceUsd?: number | null;
    marketCap?: number | null;
    fdv?: number | null;
    liquidity?: number | null;

    high24h?: number | null;
    low24h?: number | null;
    priceChange24hPercent?: number | null;

    holderCount?: number | null;
    totalSupply?: number | null;
    circulatingSupply?: number | null;
    numberMarkets?: number | null;

    v1mUSD?: number | null; vHistory1mUSD?: number | null; v1mChangePercent?: number | null;
    v5mUSD?: number | null; vHistory5mUSD?: number | null; v5mChangePercent?: number | null;
    v30mUSD?: number | null; vHistory30mUSD?: number | null; v30mChangePercent?: number | null;
    v24hUSD?: number | null; vHistory24hUSD?: number | null; v24hChangePercent?: number | null;

    vBuy1mUSD?: number | null; vSell1mUSD?: number | null;
    vBuy5mUSD?: number | null; vSell5mUSD?: number | null;
    vBuy30mUSD?: number | null; vSell30mUSD?: number | null;
    vBuy24hUSD?: number | null; vSell24hUSD?: number | null;

    trade1m?: number | null; buy1m?: number | null; sell1m?: number | null;
    trade5m?: number | null; buy5m?: number | null; sell5m?: number | null;
    trade30m?: number | null; buy30m?: number | null; sell30m?: number | null;
    trade24h?: number | null; buy24h?: number | null; sell24h?: number | null;

    uniqueWallet1m?: number | null;
    uniqueWallet5m?: number | null;
    uniqueWallet30m?: number | null;
    uniqueWallet24h?: number | null;

    projectDescription?: string | null;
    website?: string | null;
    twitter?: string | null;
    telegram?: string | null;

    topHolders?: Array<{ address: string; balance: number }> | null;

    tradingData?: {
        price?: number;
        history_5m_price?: any;
        history_1h_price?: any;
        history_4h_price?: any;
        history_24h_price?: any;
        price_change_5m_percent?: number | null;
        price_change_1h_percent?: number | null;
        price_change_6h_percent?: number | null;
        price_change_24h_percent?: number | null;
        volume_5m_usd?: number | null;
        volume_1h_usd?: number | null;
        volume_6h_usd?: number | null;
        volume_24h_usd?: number | null;
    } | null;

    platform?: 'solana';
};

export async function tryFetchFromBirdeye(mintOrSymbol: string): Promise<BirdeyeTokenData | null> {
    let address = mintOrSymbol;
    const isAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mintOrSymbol);

    if (!isAddress) {
        const searchUrl = `https://public-api.birdeye.so/defi/v3/search?chain=solana&query=${encodeURIComponent(mintOrSymbol)}`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '', 'Accept': 'application/json' }
        });
        const searchText = await searchRes.text();
        if (!searchRes.ok) return null;
        const searchData = JSON.parse(searchText);
        const items = searchData.data?.items;
        if (Array.isArray(items)) {
            const tokenItem = items.find((it: any) => it.type === "token");
            let targetToken = null;
            if (tokenItem && Array.isArray(tokenItem.result)) {
                targetToken = tokenItem.result.find((t: any) => t.symbol?.toUpperCase() === mintOrSymbol.toUpperCase())
                    || tokenItem.result.find((t: any) => t.address === mintOrSymbol);
            }
            if (!targetToken) return null;
            address = targetToken.address;
        } else {
            return null;
        }
    }

    const ovRes = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${address}`, {
        headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '', 'x-chain': 'solana', 'Accept': 'application/json' }
    });
    const ovText = await ovRes.text();
    if (!ovRes.ok) return null;
    const ovJson = JSON.parse(ovText);
    const ov = ovJson?.data;
    if (!ov) return null;

    const mdRes = await fetch(
        `https://public-api.birdeye.so/defi/v3/token/market-data?address=${address}`,
        { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '', 'x-chain': 'solana', 'Accept': 'application/json' } }
    );
    const mdText = await mdRes.text();
    if (!mdRes.ok) return null;
    const mdJson = JSON.parse(mdText);
    const md = mdJson?.data || {};

    const psRes = await fetch(
        `https://public-api.birdeye.so/defi/v3/price/stats/single?address=${address}&list_timeframe=24h`,
        { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '', 'x-chain': 'solana', 'Accept': 'application/json' } }
    );
    const psText = await psRes.text();
    if (!psRes.ok) return null;
    const psJson = JSON.parse(psText);
    const statsArr = psJson?.data && psJson.data[0]?.data;
    const stats = Array.isArray(statsArr) ? statsArr[0] : {};

    let topHolders: BirdeyeTokenData['topHolders'] = null;
    let tradingData: BirdeyeTokenData['tradingData'] = null;

    try {
        const holdersRes = await fetch(
            `https://public-api.birdeye.so/defi/v3/token/holder?address=${ov.address}&offset=0&limit=10`,
            { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '', 'x-chain': 'solana', 'Accept': 'application/json' } }
        );
        const holdersJson = await holdersRes.json();
        if (holdersJson?.data?.items && Array.isArray(holdersJson.data.items)) {
            topHolders = holdersJson.data.items.map((i: any) => ({ address: i.owner, balance: i.ui_amount }));
        }
    } catch {}

    try {
        const frames = "5m,1h,6h,24h";
        const tradeDataRes = await fetch(
            `https://public-api.birdeye.so/defi/v3/token/trade-data/single?address=${ov.address}&frames=${frames}`,
            { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '', 'x-chain': 'solana', 'Accept': 'application/json' } }
        );
        const tradeDataJson = await tradeDataRes.json();
        tradingData = tradeDataJson?.data || null;
    } catch {}

    const out: BirdeyeTokenData = {
        name   : ov.name ?? null,
        symbol : ov.symbol ?? null,
        address: ov.address,
        logoURI: ov.logoURI ?? null,

        priceUsd : ov.price ?? md.price ?? null,
        marketCap: ov.marketCap ?? md.market_cap ?? null,
        fdv      : ov.fdv ?? md.fdv ?? null,
        liquidity: ov.liquidity ?? md.liquidity ?? null,

        high24h  : stats?.high ?? null,
        low24h   : stats?.low ?? null,
        priceChange24hPercent: ov.priceChange24hPercent ?? stats?.price_change_percent ?? null,

        holderCount      : ov.holder ?? null,
        totalSupply      : ov.totalSupply ?? md.total_supply ?? null,
        circulatingSupply: ov.circulatingSupply ?? md.circulating_supply ?? null,
        numberMarkets    : ov.numberMarkets ?? null,

        v1mUSD         : ov.v1mUSD ?? null,
        vHistory1mUSD  : ov.vHistory1mUSD ?? null,
        v1mChangePercent: ov.v1mChangePercent ?? null,

        v5mUSD         : ov.v5mUSD ?? null,
        vHistory5mUSD  : ov.vHistory5mUSD ?? null,
        v5mChangePercent: ov.v5mChangePercent ?? null,

        v30mUSD         : ov.v30mUSD ?? null,
        vHistory30mUSD  : ov.vHistory30mUSD ?? null,
        v30mChangePercent: ov.v30mChangePercent ?? null,

        v24hUSD         : ov.v24hUSD ?? null,
        vHistory24hUSD  : ov.vHistory24hUSD ?? null,
        v24hChangePercent: ov.v24hChangePercent ?? null,

        vBuy1mUSD: ov.vBuy1mUSD ?? null,   vSell1mUSD: ov.vSell1mUSD ?? null,
        vBuy5mUSD: ov.vBuy5mUSD ?? null,   vSell5mUSD: ov.vSell5mUSD ?? null,
        vBuy30mUSD: ov.vBuy30mUSD ?? null, vSell30mUSD: ov.vSell30mUSD ?? null,
        vBuy24hUSD: ov.vBuy24hUSD ?? null, vSell24hUSD: ov.vSell24hUSD ?? null,

        trade1m: ov.trade1m ?? null, buy1m: ov.buy1m ?? null, sell1m: ov.sell1m ?? null,
        trade5m: ov.trade5m ?? null, buy5m: ov.buy5m ?? null, sell5m: ov.sell5m ?? null,
        trade30m: ov.trade30m ?? null, buy30m: ov.buy30m ?? null, sell30m: ov.sell30m ?? null,
        trade24h: ov.trade24h ?? null, buy24h: ov.buy24h ?? null, sell24h: ov.sell24h ?? null,

        uniqueWallet1m: ov.uniqueWallet1m ?? null,
        uniqueWallet5m: ov.uniqueWallet5m ?? null,
        uniqueWallet30m: ov.uniqueWallet30m ?? null,
        uniqueWallet24h: ov.uniqueWallet24h ?? null,

        projectDescription: ov.description ?? null,
        website : ov.website ?? ov.extensions?.website ?? null,
        twitter : ov.twitter ?? ov.extensions?.twitter ?? null,
        telegram: ov.telegram ?? ov.extensions?.telegram ?? null,

        topHolders,
        tradingData,
        platform: 'solana',
    };

    return out;
}