export const KAMINO_API_BASE = "https://api.kamino.finance";
export const DEFAULT_CLUSTER = "mainnet-beta" as const;


export const KAMINO_PROGRAM_ID = 
    process.env.KAMINO_PROGRAM_ID ?? "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";

export const KAMINO_MAIN_MARKET = 
    process.env.KAMINO_MAIN_MARKET ?? "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";


export const RPC_URL = process.env.RPC_URL!;
export const COMMITMENT = 'confirmed' as const;


export const SYMBOLS_WHITELIST: string[] = (
    process.env.KAMINO_SYMBOLS_WHITELIST
        ? process.env.KAMINO_SYMBOLS_WHITELIST.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        : ['SOL', 'USDC', 'USDT', 'mSOL', 'JitoSOL']
);