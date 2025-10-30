import { PublicKey } from '@solana/web3.js';

export interface KaminoMarket {
    address: string;
    name: string;
    reserves: Map<string, KaminoReserve>;
    programId: string;
}

export interface KaminoReserve {
    address: string;
    symbol: string;
    decimals: number;
    liquidity: {
        mint: PublicKey;
        mintDecimals: number;
        supply: any;
        fee: any;
    };
    stats: {
        symbol: string;
        liquidityMint: PublicKey;
        liquidityMintDecimals: number;
    };
    config: {
        tokenInfo: {
            symbol: string;
            name: string;
        };
        liquidityMint: PublicKey;
        liquidityMintDecimals: number;
    };
}

export interface KaminoObligation {
    owner: string;
    deposits: Array<{
        mint: string;
        amount: number;
        symbol: string;
    }>;
    borrows: Array<{
        mint: string;
        amount: number;
        symbol: string;
    }>;
}

export interface KaminoReserveHistory {
    timestamp: string;
    tvl: number;
    supplyApy: number;
    borrowApy: number;
    utilization: number;
}

export interface KaminoObligationPnl {
    obligation: string;
    pnl: number;
    positionValue: number;
    collateralValue: number;
    borrowValue: number;
}

export interface KaminoDepositParams {
    token: string;
    amount: number;
    market?: string;
    priorityFee?: number;
}

export interface KaminoWithdrawParams {
    token: string;
    amount: number;
    market?: string;
    priorityFee?: number;
}

export interface KaminoBorrowParams {
    token: string;
    amount: number;
    market?: string;
    priorityFee?: number;
}

export interface KaminoRepayParams {
    token: string;
    amount: number;
    market?: string;
    priorityFee?: number;
}

export interface KaminoHealthParams {
    user: string;
    token?: string;
    market?: string;
}

export interface KaminoMarketParams {
    market?: string;
}

export interface KaminoUserObligationsParams {
    user: string;
    market?: string;
    env?: string;
}

export interface KaminoReserveHistoryParams {
    market: string;
    reserve: string;
    start?: string;
    end?: string;
    frequency?: 'hour' | 'day';
    env?: string;
}

export interface KaminoObligationPnlParams {
    market: string;
    obligation: string;
    positionMode?: 'current_obligation' | 'user_all_current_positions';
    useStakeRate?: boolean;
}
