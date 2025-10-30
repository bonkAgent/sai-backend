import fetch from "node-fetch";
import {Connection, PublicKey} from "@solana/web3.js";
import {getMint} from "@solana/spl-token";
import {getLaunchpadTokenInfo} from "../../../services/raydiumService";

let cachedTokenList: any[] = [];
let lastFetchTime: number = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

let _solPriceCache: { v: number, at: number } | null = null;
const SOL_PRICE_TTL = 1000 * 30; // 30s

export type CacheEntry<T> = { value: T; at: number };
export const META_TTL = 1000 * 60 * 60;
export const PRICE_TTL = 1000 * 30;

export const metadataCache = new Map<string, CacheEntry<any>>();
export const priceCache    = new Map<string, CacheEntry<number>>();

export function getCached<T>(map: Map<string, CacheEntry<T>>, key: string, ttl: number): T | null {
    const e = map.get(key);
    if (!e) return null;
    if (Date.now() - e.at > ttl) { map.delete(key); return null; }
    return e.value;
}
export function setCached<T>(map: Map<string, CacheEntry<T>>, key: string, value: T) {
    map.set(key, { value, at: Date.now() });
}

export function findTokenInBalance(balances: any[], token: string) {
    const t = token.trim().toUpperCase();
    return balances.filter(b => (b.symbol || '').toUpperCase() === t);
}

export async function getSolPriceCached(): Promise<number | null> {
    if (_solPriceCache && (Date.now() - _solPriceCache.at) < SOL_PRICE_TTL) {
        return _solPriceCache.v;
    }
    const v = await fetchSolPriceUsd();
    if (v != null) _solPriceCache = { v, at: Date.now() };
    return v;
}

async function fetchSolPriceUsd(): Promise<number | null> {
    try {
        const res = await fetch(
            `https://public-api.birdeye.so/defi/v3/token/market-data?address=${SOL_MINT}&chain=solana`,
            { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '', 'x-chain': 'solana', 'Accept': 'application/json' } }
        );
        if (!res.ok) return null;
        const j = await res.json();
        const p = j?.data?.price;
        return (typeof p === 'number' && isFinite(p)) ? p : null;
    } catch { return null; }
}

export async function getTokenPriceUsd(mint: string, solPriceUsd?: number): Promise<number | null> {
    const hit = getCached(priceCache, mint, PRICE_TTL);
    if (hit != null) return hit;

    if (mint === SOL_MINT) {
        const p = solPriceUsd ?? await getSolPriceCached();
        if (p != null) { setCached(priceCache, mint, p); return p; }
        return null;
    }

    try {
        const info = await findSolanaToken(mint, true);
        if (info && typeof info !== 'string') {
            let price: number | null = null;
            if (typeof info.priceUsd === 'number') price = info.priceUsd;
            else if (info.priceSol) {
                const sol = solPriceUsd ?? await getSolPriceCached();
                if (sol != null) price = info.priceSol * sol;
            }
            if (price != null && isFinite(price)) { setCached(priceCache, mint, price); return price; }
        }
    } catch {}

    try {
        const res = await fetch(
            `https://public-api.birdeye.so/defi/v3/token/market-data?address=${mint}&chain=solana`,
            { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || '', 'x-chain': 'solana', 'Accept': 'application/json' } }
        );
        if (res.ok) {
            const j = await res.json();
            const p = j?.data?.price;
            if (typeof p === 'number' && isFinite(p)) { setCached(priceCache, mint, p); return p; }
        }
    } catch {}

    return null;
}

export async function findFromList(mintOrSymbol: string) {
    const now = Date.now();
    if (cachedTokenList.length === 0 || (now - lastFetchTime > CACHE_TTL)) {
        try {
            const res = await fetch("https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json");
            const json = await res.json();
            cachedTokenList = json.tokens;
            lastFetchTime = now;
        } catch (err) {
            console.error("Failed to update token list, using old cache if available.");
        }
    }

    const fromList = cachedTokenList.find(
        t => t.symbol.toUpperCase() === mintOrSymbol.toUpperCase() || t.address === mintOrSymbol
    );
    if (fromList){return fromList}else{return null};
}

export async function findSolanaToken(mintOrSymbol: string, full: boolean) {
    //check if it is sol
    if(!full){
        if (mintOrSymbol.toUpperCase() === 'SOL') {
            return {
                address: 'So11111111111111111111111111111111111111112',
                decimals: 9,
                symbol: 'SOL',
                name: 'Solana',
                logoURI: 'https://res.coinpaper.com/coinpaper/solana_sol_logo_32f9962968.png',
                extensions: { coingeckoId: 'solana' },
            };
        }

        //check from solana list
        const fromList = await findFromList(mintOrSymbol);
        if (fromList) return fromList;
    }

    const fromListToken = await findFromList(mintOrSymbol);
    if(fromListToken) mintOrSymbol = fromListToken.address;
    //if it is a pubkey
    if (mintOrSymbol.match(/^.{32,44}$/)) {
        try {
            const connection = new Connection(process.env.RPC_URL!);
            const mint = new PublicKey(mintOrSymbol);
            const mintInfo = await getMint(connection, mint);
            const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mintOrSymbol}`);
            const json = await res.json();
            const match = json[0];
            if(match) {
                return {
                    priceUsd: match.priceUsd,
                    address: match.baseToken.address,
                    symbol: match.baseToken.symbol,
                    name: match.baseToken.name,
                    logoURI: match?.info?.imageUrl || "no_URI",
                    volume: match.volume,
                    priceChange: match.priceChange,
                    liquidity: match.liquidity.usd,
                    marketCap: match.marketCap,
                    decimals: mintInfo.decimals != null? mintInfo.decimals : 6, // Default
                };
            }
        }catch (err) {
            console.log(`[findSolanaToken] Dexscreener pubkey fallback failed for ${mintOrSymbol}`);
        }

        try {
            const match = await getLaunchpadTokenInfo(new PublicKey(mintOrSymbol));
            if(match) {
                return match;
            }
        }catch (err) {
            console.log(`[findSolanaToken] Launchpad pubkey fallback failed for ${mintOrSymbol}`);
        }

        return "can't find info about this token";
        //if it is a ticker
    }else{
        try {
            const connection = new Connection(process.env.RPC_URL!);
            const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=SOL/${mintOrSymbol}`);
            const json = await res.json();
            let match;
            for(const pair of json.pairs){
                if(pair.chainId === "solana" && pair.quoteToken.symbol === "SOL" && pair.baseToken.symbol === mintOrSymbol){
                    match = pair;
                    break;
                }
            }

            const mint = new PublicKey(match.baseToken.address);
            const mintInfo = await getMint(connection, mint);

            if (match?.baseToken) {
                return {
                    priceUsd: match.priceUsd,
                    address: match.baseToken.address,
                    symbol: match.baseToken.symbol,
                    name: match.baseToken.name,
                    logoURI: match.info?.imageUrl,
                    volume: match.volume,
                    priceChange: match.priceChange,
                    liquidity: match.liquidity.usd,
                    marketCap: match.marketCap,
                    decimals: mintInfo?.decimals || 6, // Default
                };
            }
        } catch (err) {
            console.log(`[findSolanaToken] Dexscreener ticker fallback failed for ${mintOrSymbol}`);
        }

        return "can't find info about such token use ";
    }
}
export async function toUsd(amount: number | null | undefined, mintOrSymbol: string): Promise<number | null> {
    if (amount == null) return null;
    const price = await getTokenPriceUsd(mintOrSymbol);
    return (price != null) ? +(amount * price).toFixed(4) : null;
}