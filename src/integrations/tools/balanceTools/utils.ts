import {findFromList, getCached, getTokenPriceUsd, META_TTL, metadataCache, setCached} from "../priceTools/utils";
import {Connection, PublicKey} from "@solana/web3.js";
import {getMint} from "@solana/spl-token";

const inFlightMeta  = new Map<string, Promise<any>>();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function findSolanaToken(mintOrSymbol: string, full: boolean) {
    console.log(mintOrSymbol)
    //check if it is sol
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

export async function slowMetaAndPrice(balances: any, solPrice: number | null) {
    const metas: any[]  = [];
    const prices: (number|null)[] = [];

    for (const b of balances) {
        metas.push(await getTokenMetadataFast(b.address));
        prices.push(await getTokenPriceUsd(b.address, solPrice ?? undefined));

        await sleep(250);
    }

    return { metas, prices };
}

export async function getTokenMetadataFast(mint: string) {
    const hit = getCached(metadataCache, mint, META_TTL);
    if (hit) return hit;
    if (inFlightMeta.has(mint)) return inFlightMeta.get(mint)!;

    const work = (async () => {
        const fromList = await findFromList(mint);
        if (fromList) {
            const meta = {
                address : fromList.address,
                symbol  : fromList.symbol,
                name    : fromList.name,
                logoURI : fromList.logoURI,
                decimals: fromList.decimals ?? 6,
            };
            setCached(metadataCache, mint, meta);
            return meta;
        }
        const info = await findSolanaToken(mint, true);
        const meta = {
            address : typeof info === 'string' ? mint : (info.address ?? mint),
            symbol  : typeof info === 'string' ? mint.slice(0,4)+'...' : (info.symbol ?? mint.slice(0,4)+'...'),
            name    : typeof info === 'string' ? 'Unknown' : (info.name ?? 'Unknown'),
            logoURI : typeof info === 'string' ? undefined : info.logoURI,
            decimals: typeof info === 'string' ? 6 : (info.decimals ?? 6),
        };
        setCached(metadataCache, mint, meta);
        return meta;
    })().finally(() => inFlightMeta.delete(mint));

    inFlightMeta.set(mint, work);
    return work;
}