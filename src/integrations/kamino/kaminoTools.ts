import { Keypair } from "@solana/web3.js";
import { User } from "@privy-io/server-auth";

import { 
    getMarkets, 
    getMarket, 
    getUserObligations, 
    getReserveHistory, 
    getObligationPnl,
    getReserves,
    getReserveCurrentMetrics,
    getReservesMetrics,
} from "./api";
import { kaminoDeposit, kaminoWithdraw, kaminoBorrow, kaminoRepay, kaminoHealth } from "./transactions";
import { KAMINO_PROGRAM_ID, KAMINO_MAIN_MARKET, RPC_URL, DEFAULT_CLUSTER } from "./constants";
import { enoughMoney } from "../../utils/enoughMoney";
import { getBalances } from "../../services/mongoService";
import { 
    KaminoDepositParams, 
    KaminoWithdrawParams,
    KaminoBorrowParams,
    KaminoRepayParams,
    KaminoMarketParams,
    KaminoReserveHistoryParams,
    KaminoObligationPnlParams
} from "./types";
import { KaminoMarket, DEFAULT_RECENT_SLOT_DURATION_MS } from "@kamino-finance/klend-sdk";
import { CliConnectionPool } from "@kamino-finance/klend-sdk/dist/client/tx/CliConnectionPool";
import type { Chain } from "@kamino-finance/klend-sdk/dist/client/tx/rpc";
import { address as toAddress } from "@solana/kit";
import { resolveTokenMint, isTokenSupported, getAllAvailableTokens } from "./tokens";

export type ToolHandler =
    (args: any, keypair?: Keypair, user?: User) =>
        Promise<{ resForAi: any; resForStatus?: any }>;

function buildFormattedObligations(user: string, market: string, raw: any) {
    const obligations = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const toNum = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const deposits = obligations
        .flatMap((o: any) => o?.deposits || [])
        .filter((d: any) => toNum(d?.amount) > 0)
        .map((d: any) => ({ symbol: d?.symbol || 'UNKNOWN', mint: d?.mint, amount: toNum(d?.amount) }));

    const borrows = obligations
        .flatMap((o: any) => o?.borrows || [])
        .filter((b: any) => toNum(b?.amount) > 0)
        .map((b: any) => ({ symbol: b?.symbol || 'UNKNOWN', mint: b?.mint, amount: toNum(b?.amount) }));

    const totalDepositedBySymbol: Record<string, number> = {};
    for (const d of deposits) totalDepositedBySymbol[d.symbol] = (totalDepositedBySymbol[d.symbol] || 0) + d.amount;

    const totalBorrowedBySymbol: Record<string, number> = {};
    for (const b of borrows) totalBorrowedBySymbol[b.symbol] = (totalBorrowedBySymbol[b.symbol] || 0) + b.amount;

    const summary = {
        deposited: Object.entries(totalDepositedBySymbol).map(([symbol, amount]) => ({ symbol, amount })),
        borrowed: Object.entries(totalBorrowedBySymbol).map(([symbol, amount]) => ({ symbol, amount })),
    };

    const formatted = { deposits, borrows, summary };

    return { formatted, obligations };
}

async function sdkFallbackObligations(user: string) {
    const wsUrl = process.env.RPC_WS_URL || RPC_URL.replace('https://', 'wss://');
    const chain: Chain = { name: DEFAULT_CLUSTER as any, endpoint: { url: RPC_URL, name: 'primary' }, wsEndpoint: { url: wsUrl, name: 'primary-ws' }, multicastEndpoints: [] };
    const c = new CliConnectionPool(chain);
    const market = await KaminoMarket.load(c.rpc as any, toAddress(KAMINO_MAIN_MARKET), DEFAULT_RECENT_SLOT_DURATION_MS, toAddress(KAMINO_PROGRAM_ID));
    if (!market) return null;
    await market.loadReserves();
    const userAddr = toAddress(user);
    const obl = await market.getUserVanillaObligation(userAddr);
    if (!obl) return null;

    const positions = obl.getDeposits();
    const deposits = positions.map((p: any) => {
        const reserve = market.getReserveByAddress(p.reserveAddress);
        const symbol = reserve?.symbol || 'UNKNOWN';
        // USD market value for readability; amount is in lamports-like units
        return { symbol, mint: p.mintAddress, amountUsd: Number(p.marketValueRefreshed) };
    });

    return { deposits, obligation: obl };
}

export const KAMINO_TOOL_HANDLERS: Record<string, ToolHandler> = {
    KAMINO_LIST_RESERVES: async (args: KaminoMarketParams) => {
        try {
            const marketAddr = args?.market && args.market.trim() ? args.market : KAMINO_MAIN_MARKET;
            const data: any = await getMarket(marketAddr, KAMINO_PROGRAM_ID);

            let reservesRaw: any[] = [];
            const candidates: any[] = [];
            if (Array.isArray(data)) candidates.push(data);
            if (Array.isArray(data?.reserves)) candidates.push(data.reserves);
            if (data?.reserves && typeof data.reserves === 'object') candidates.push(Object.values(data.reserves));
            if (Array.isArray(data?.market?.reserves)) candidates.push(data.market.reserves);
            if (data?.market?.reserves && typeof data.market.reserves === 'object') candidates.push(Object.values(data.market.reserves));
            if (data?.reservesMap && typeof data.reservesMap === 'object') candidates.push(Object.values(data.reservesMap));
            if (data?.reserveMap && typeof data.reserveMap === 'object') candidates.push(Object.values(data.reserveMap));
            if (data?.reservesByMint && typeof data.reservesByMint === 'object') candidates.push(Object.values(data.reservesByMint));
            if (data?.reservesByToken && typeof data.reservesByToken === 'object') candidates.push(Object.values(data.reservesByToken));
            for (const c of candidates) {
                if (Array.isArray(c) && c.length) {
                    reservesRaw = c;
                    break;
                }
            }

            const toNum = (v: any) => {
                const n = Number(v);
                return Number.isFinite(n) ? n : 0;
            };

            const parseFromApi = (r: any) => {
                const symbol = r?.symbol
                    || r?.config?.tokenInfo?.symbol
                    || r?.stats?.symbol
                    || 'UNKNOWN';
                const reserveAddress = String(r?.address || r?.reserve || r?.pubkey || r?.reserveAddress || '');
                const liquidityMint = String(
                    r?.liquidity?.mint
                    || r?.stats?.liquidityMint
                    || r?.config?.liquidityMint
                    || ''
                );
                const utilization = toNum(
                    r?.utilization
                    || r?.stats?.utilization
                    || r?.metrics?.utilization
                );
                const supplyApy = toNum(
                    r?.stats?.supplyApy
                    || r?.apy?.supply
                    || r?.metrics?.supplyApy
                    || r?.supplyApy
                );
                const borrowApy = toNum(
                    r?.stats?.borrowApy
                    || r?.apy?.borrow
                    || r?.metrics?.borrowApy
                    || r?.borrowApy
                );
                const depositEnabled = Boolean(
                    r?.config?.depositEnabled ?? r?.depositEnabled ?? true
                );
                const borrowEnabled = Boolean(
                    r?.config?.borrowEnabled ?? r?.borrowEnabled ?? true
                );

                const ltv = toNum(
                    r?.config?.ltv
                    || r?.config?.loanToValue
                    || r?.stats?.ltv
                );
                const liquidationLtv = toNum(
                    r?.config?.liquidationLtv
                    || r?.stats?.liquidationLtv
                );

                return {
                    symbol,
                    reserveAddress,
                    liquidityMint,
                    supplyApy,
                    borrowApy,
                    utilization,
                    depositEnabled,
                    borrowEnabled,
                    ltv,
                    liquidationLtv,
                };
            };

            let items = reservesRaw.map(parseFromApi);

            // Prefer SDK to get full set + live metrics
            try {
                const wsUrl = process.env.RPC_WS_URL || RPC_URL.replace('https://', 'wss://');
                const chain: Chain = {
                    name: DEFAULT_CLUSTER as any,
                    endpoint: {url: RPC_URL, name: 'primary'},
                    wsEndpoint: {url: wsUrl, name: 'primary-ws'},
                    multicastEndpoints: []
                };
                const c = new CliConnectionPool(chain);
                const m = await KaminoMarket.load(c.rpc as any, toAddress(marketAddr), DEFAULT_RECENT_SLOT_DURATION_MS, toAddress(KAMINO_PROGRAM_ID));
                if (m) {
                    await m.loadReserves();
                    // critical: refresh caches to get rates/stats
                    if ((m as any).refreshAll) {
                        await (m as any).refreshAll();
                    }

                    const sdkItems: any[] = [];
                    const seen: Set<string> = new Set();
                    const pushItem = (r: any) => {
                        try {
                            const symbol = r?.symbol || r?.config?.tokenInfo?.symbol || 'UNKNOWN';
                            const reserveAddress = String(r?.getReserveAddress?.() || r?.address || r?.reserveAddress || '');
                            const liquidityMint = String(r?.getLiquidityMint?.() || r?.liquidityMint || r?.config?.liquidityMint || '');
                            const rates = r?.refreshedRates || r?.rates || r?.stats?.rates || {};
                            const stats = r?.refreshedStats || r?.stats || {};
                            const config = r?.config || {};

                            const toNum = (v: any) => {
                                const n = typeof v === 'bigint' ? Number(v) : Number(v);
                                return Number.isFinite(n) ? n : 0;
                            };

                            const supplyAprRaw = rates.supplyApr ?? rates.depositApr ?? rates.supplyRate ?? rates.depositRate ?? 0;
                            const borrowAprRaw = rates.borrowApr ?? rates.borrowRate ?? 0;
                            const supplyApyRaw = rates.supplyApy ?? rates.depositApy;
                            const borrowApyRaw = rates.borrowApy;
                            const supplyApr = toNum(supplyAprRaw);
                            const borrowApr = toNum(borrowAprRaw);
                            const aprToApy = (apr: number) => (apr ? (Math.pow(1 + apr / 365, 365) - 1) : 0);
                            const supplyApy = supplyApyRaw != null ? toNum(supplyApyRaw) : aprToApy(supplyApr);
                            const borrowApy = borrowApyRaw != null ? toNum(borrowApyRaw) : aprToApy(borrowApr);
                            const utilization = toNum(stats.utilization ?? stats.utilizationRate ?? stats.utilizationRatio ?? 0);
                            const ltv = toNum(config.loanToValueRatio ?? config.loanToValue ?? config.maxLtv ?? stats.ltv ?? 0);
                            const liquidationLtv = toNum(config.liquidationLtvRatio ?? config.liquidationLtv ?? config.liquidationThreshold ?? stats.liquidationLtv ?? 0);

                            if (seen.has(reserveAddress)) return;
                            seen.add(reserveAddress);
                            sdkItems.push({
                                symbol,
                                reserveAddress,
                                liquidityMint,
                                supplyApy,
                                borrowApy,
                                utilization,
                                depositEnabled: true,
                                borrowEnabled: true,
                                ltv,
                                liquidationLtv,
                            });
                        } catch (_) {
                        }
                    };
                    const reservesArr: any[] = Array.isArray((m as any).reserves) ? (m as any).reserves : [];
                    for (const r of reservesArr) pushItem(r);
                    const reservesMap: any = (m as any).reservesMap || (m as any).getReservesMap?.();
                    if (reservesMap && typeof reservesMap === 'object') {
                        for (const k of Object.keys(reservesMap)) pushItem(reservesMap[k]);
                    }

                    if (sdkItems.length) items = sdkItems;
                }
            } catch (_) {
            }

            try {
                const reservesApi = await getReserves(marketAddr, DEFAULT_CLUSTER, KAMINO_PROGRAM_ID);
                const arr = Array.isArray(reservesApi) ? reservesApi : Array.isArray(reservesApi?.reserves) ? reservesApi.reserves : [];
                const enriched = arr.map(parseFromApi);
                if (enriched.length && enriched.length > items.length) items = enriched;
            } catch (_) { /* ignore */
            }

            if (!items.length) {
                try {
                    const reservesApi = await getReserves(marketAddr, DEFAULT_CLUSTER);
                    const arr = Array.isArray(reservesApi) ? reservesApi : Array.isArray(reservesApi?.reserves) ? reservesApi.reserves : [];
                    const enriched = arr.map(parseFromApi);
                    if (enriched.length) items = enriched;
                } catch (_) {
                }
            }

            if (!items.length) {
                const wsUrl = process.env.RPC_WS_URL || RPC_URL.replace('https://', 'wss://');
                const chain: Chain = {
                    name: DEFAULT_CLUSTER as any,
                    endpoint: {url: RPC_URL, name: 'primary'},
                    wsEndpoint: {url: wsUrl, name: 'primary-ws'},
                    multicastEndpoints: []
                };
                const c = new CliConnectionPool(chain);
                const market = await KaminoMarket.load(c.rpc as any, toAddress(marketAddr), DEFAULT_RECENT_SLOT_DURATION_MS, toAddress(KAMINO_PROGRAM_ID));
                if (market) {
                    await market.loadReserves();
                    const symbols = (process.env.KAMINO_SYMBOLS_WHITELIST ? String(process.env.KAMINO_SYMBOLS_WHITELIST).split(',').map(s => s.trim()).filter(Boolean) : ['SOL', 'USDC', 'USDT', 'bSOL', 'JTO', 'ETH', 'MSOL', 'JITOSOL']);
                    const acc: any[] = [];
                    console.log(`[KAMINO RESERVES] Trying symbols: ${symbols.join(', ')}`);
                    for (const sym of symbols) {
                        try {
                            const r: any = market.getReserveBySymbol(sym);
                            if (!r) {
                                console.log(`[KAMINO RESERVES] Symbol ${sym} not found`);
                                continue;
                            }
                            console.log(`[KAMINO RESERVES] Found symbol: ${sym}`);
                            const mint = String(r.getLiquidityMint?.() || r.liquidityMint || '');
                            const reserveAddress = String(r.address || r.reserveAddress || r.getReserveAddress?.() || '');
                            const supplyApy = toNum(r?.refreshedRates?.supplyApy ?? r?.stats?.supplyApy);
                            const borrowApy = toNum(r?.refreshedRates?.borrowApy ?? r?.stats?.borrowApy);
                            const utilization = toNum(r?.refreshedStats?.utilization ?? r?.stats?.utilization);
                            const ltv = toNum(r?.config?.loanToValue ?? r?.stats?.ltv);
                            const liquidationLtv = toNum(r?.config?.liquidationLtv ?? r?.stats?.liquidationLtv);
                            acc.push({
                                symbol: sym,
                                reserveAddress,
                                liquidityMint: mint,
                                supplyApy,
                                borrowApy,
                                utilization,
                                depositEnabled: true,
                                borrowEnabled: true,
                                ltv,
                                liquidationLtv,
                            });
                        } catch (_) {
                        }
                    }
                    items = acc;
                }
            }

            try {
                const bulk = await getReservesMetrics(marketAddr, DEFAULT_CLUSTER);
                const byReserve: Record<string, any> = {};
                for (const m of (Array.isArray(bulk) ? bulk : [])) {
                    const key = String(m?.reserve || "");
                    if (!key) continue;
                    byReserve[key] = m;
                }
                items = items.map((it: any) => {
                    const m = byReserve[it.reserveAddress];
                    if (!m) return it;
                    const toN = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
                    const sA = toN(m.supplyApy) * 100;
                    const bA = toN(m.borrowApy) * 100;
                    const maxLtv = toN(m.maxLtv) * 100;
                    return {
                        ...it,
                        supplyApy: sA || it.supplyApy,
                        borrowApy: bA || it.borrowApy,
                        ltv: maxLtv || it.ltv,
                    };
                });
            } catch (_) {
            }

            const needMetrics = items.some((it: any) => !it || (!Number(it.supplyApy) && !Number(it.borrowApy) && !Number(it.utilization)));
            if (needMetrics && items.length) {
                const updated: any[] = [];
                for (const it of items) {
                    try {
                        // try current metrics endpoint first
                        let cur = await getReserveCurrentMetrics(marketAddr, it.reserveAddress, DEFAULT_CLUSTER, KAMINO_PROGRAM_ID);
                        let sA1 = Number(cur?.supplyApy);
                        let bA1 = Number(cur?.borrowApy);
                        let u1 = Number(cur?.utilization);
                        if (Number.isFinite(sA1)) it.supplyApy = sA1;
                        if (Number.isFinite(bA1)) it.borrowApy = bA1;
                        if (Number.isFinite(u1)) it.utilization = u1;
                        if ((!it.supplyApy && !it.borrowApy) || !it.utilization) {
                            // fallback to history last point
                            const hist = await getReserveHistory({
                                market: marketAddr,
                                reserve: it.reserveAddress,
                                frequency: 'hour',
                                env: DEFAULT_CLUSTER as any,
                            } as any);
                            if (Array.isArray(hist) && hist.length) {
                                const last = hist[hist.length - 1];
                                const sA = Number(last?.supplyApy);
                                const bA = Number(last?.borrowApy);
                                const u = Number(last?.utilization);
                                if (Number.isFinite(sA)) it.supplyApy = sA;
                                if (Number.isFinite(bA)) it.borrowApy = bA;
                                if (Number.isFinite(u)) it.utilization = u;
                            }
                            // try metrics by liquidity mint as alternate key
                            if ((!it.supplyApy && !it.borrowApy) || !it.utilization) {
                                cur = await getReserveCurrentMetrics(marketAddr, it.liquidityMint, DEFAULT_CLUSTER, KAMINO_PROGRAM_ID);
                                sA1 = Number(cur?.supplyApy);
                                bA1 = Number(cur?.borrowApy);
                                u1 = Number(cur?.utilization);
                                if (Number.isFinite(sA1)) it.supplyApy = sA1;
                                if (Number.isFinite(bA1)) it.borrowApy = bA1;
                                if (Number.isFinite(u1)) it.utilization = u1;
                            }
                            // try history by liquidity mint
                            if ((!it.supplyApy && !it.borrowApy) || !it.utilization) {
                                const hist2 = await getReserveHistory({
                                    market: marketAddr,
                                    reserve: it.liquidityMint,
                                    frequency: 'hour',
                                    env: DEFAULT_CLUSTER as any,
                                } as any);
                                if (Array.isArray(hist2) && hist2.length) {
                                    const last2 = hist2[hist2.length - 1];
                                    const sA = Number(last2?.supplyApy);
                                    const bA = Number(last2?.borrowApy);
                                    const u = Number(last2?.utilization);
                                    if (Number.isFinite(sA)) it.supplyApy = sA;
                                    if (Number.isFinite(bA)) it.borrowApy = bA;
                                    if (Number.isFinite(u)) it.utilization = u;
                                }
                            }
                        }
                    } catch (_) {
                    }
                    updated.push(it);
                }
                items = updated;
            }

            return {
                resForAi: {
                    status: 'success',
                    market: marketAddr,
                    reserves: items,
                    message: `Found ${items.length} reserves for market ${marketAddr}`,
                },
            };
        } catch (error: any) {
            return {
                resForAi: {status: 'error', error: error?.message || String(error)},
            };
        }
    },
    KAMINO_GET_MARKETS: async () => {
        try {
            const data = await getMarkets(KAMINO_PROGRAM_ID);
            return {
                resForAi: {
                    status: "success",
                    markets: data,
                    message: `Found ${Array.isArray(data) ? data.length : 'unknown'} markets`
                }
            };
        } catch (error: any) {
            return {
                resForAi: {
                    status: "error",
                    error: error.message || 'Failed to fetch markets'
                }
            };
        }
    },

    KAMINO_GET_MARKET: async (args: KaminoMarketParams) => {
        try {
            const market = args.market && args.market.trim() ? args.market : KAMINO_MAIN_MARKET;
            const data = await getMarket(market, KAMINO_PROGRAM_ID);
            return {
                resForAi: {
                    status: "success",
                    market: data,
                    marketAddress: market,
                    message: `Market data retrieved successfully`
                }
            };
        } catch (error: any) {
            return {
                resForAi: {
                    status: "error",
                    error: error.message || 'Failed to fetch market data'
                }
            };
        }
    },
    KAMINO_MY_POSITIONS: async (_args: any, keypair?: Keypair, user?: User) => {
        if (!keypair) {
            return {
                resForAi: {
                    status: "error",
                    error: "Keypair is required to check positions"
                }
            };
        }

        try {
            const userAddress = keypair.publicKey.toBase58();
            console.log(`[KAMINO MY POSITIONS] Checking positions for user: ${userAddress}`);

            const market = KAMINO_MAIN_MARKET;
            const data = await getUserObligations({market, user: userAddress});

            let {formatted, obligations} = buildFormattedObligations(userAddress, market, data);

            if ((!formatted.deposits || !formatted.deposits.length) && Array.isArray(obligations) && obligations.length) {
                const stats = obligations[0]?.refreshedStats;
                if (stats && Number(stats.userTotalDeposit) > 0) {
                    console.log(`[KAMINO MY POSITIONS] Using SDK fallback for deposits`);
                    const fb = await sdkFallbackObligations(userAddress);
                    if (fb && fb.deposits?.length) {
                        formatted.deposits = fb.deposits.map((d: any) => ({
                            symbol: d.symbol,
                            mint: String(d.mint),
                            amount: Number(d.amountUsd)
                        }));
                    }
                }
            }

            const hasDeposits = formatted.deposits && formatted.deposits.length > 0;
            const hasBorrows = formatted.borrows && formatted.borrows.length > 0;

            if (!hasDeposits && !hasBorrows) {
                return {
                    resForAi: {
                        status: "success",
                        message: "You have no active positions in Kamino Lending yet. Make a deposit to start earning.",
                        deposits: [],
                        borrows: [],
                        userAddress
                    }
                };
            }

            let positionsText = "🏦 **Your positions in Kamino Lending:**\n\n";

            if (hasDeposits) {
                positionsText += "💰 **Deposits (earning interest):**\n";
                formatted.deposits.forEach((dep: any) => {
                    positionsText += `• ${dep.amount.toFixed(6)} ${dep.symbol}\n`;
                });
                positionsText += "\n";
            }

            if (hasBorrows) {
                positionsText += "📋 **Borrows (require repayment):**\n";
                formatted.borrows.forEach((bor: any) => {
                    positionsText += `• ${bor.amount.toFixed(6)} ${bor.symbol}\n`;
                });
                positionsText += "\n";
            }

            positionsText += "💡 You can:\n";
            positionsText += "• Deposit more assets\n";
            positionsText += "• Withdraw your deposits\n";
            positionsText += "• Take a collateralized loan\n";
            positionsText += "• Repay your loans";

            return {
                resForAi: {
                    status: "success",
                    message: positionsText,
                    deposits: formatted.deposits,
                    borrows: formatted.borrows,
                    userAddress,
                    summary: formatted.summary
                }
            };
        } catch (error: any) {
            console.error(`[KAMINO MY POSITIONS ERROR]`, error);
            return {
                resForAi: {
                    status: "error",
                    error: `Failed to fetch positions: ${error.message || "Technical error"}`
                }
            };
        }
    },

    KAMINO_GET_RESERVE_HISTORY: async (args: KaminoReserveHistoryParams) => {
        try {
            const data = await getReserveHistory(args);
            return {
                resForAi: {
                    status: "success",
                    history: data,
                    params: args,
                    message: "Reserve history retrieved successfully"
                }
            };
        } catch (error: any) {
            return {
                resForAi: {
                    status: "error",
                    error: error.message || "Failed to fetch reserve history"
                }
            };
        }
    },

    KAMINO_GET_OBLIGATION_PNL: async (args: KaminoObligationPnlParams) => {
        try {
            const data = await getObligationPnl(args);
            return {
                resForAi: {
                    status: "success",
                    pnl: data,
                    params: args,
                    message: "Obligation PnL retrieved successfully"
                }
            };
        } catch (error: any) {
            return {
                resForAi: {
                    status: "error",
                    error: error.message || "Failed to fetch obligation PnL"
                }
            };
        }
    },

    KAMINO_LEND_DEPOSIT: async (args: KaminoDepositParams, keypair?: Keypair, user?: any) => {
        console.log(`[KAMINO TOOL DEPOSIT] Called with args:`, JSON.stringify(args, null, 2));
        console.log(`[KAMINO TOOL DEPOSIT] Keypair present: ${!!keypair}`);
        console.log(`[KAMINO TOOL DEPOSIT] User present: ${!!user}`);

        if (!keypair) {
            console.error(`[KAMINO TOOL DEPOSIT] No keypair provided`);
            return {
                resForAi: {
                    status: "error",
                    error: "Keypair is required for deposit operations"
                }
            };
        }

        if (!user) {
            console.error(`[KAMINO TOOL DEPOSIT] No user provided`);
            return {
                resForAi: {
                    status: "error",
                    error: "User is required for balance checks"
                }
            };
        }

        try {
            console.log(`[KAMINO TOOL DEPOSIT] Checking user balance`);
            const balance = await getBalances(user);

            const tokenAddress = await resolveTokenMint(args.token);
            if (!tokenAddress) {
                return {
                    resForAi: {
                        status: "error",
                        error: `Token ${args.token} is not supported in Kamino. Use KAMINO_GET_AVAILABLE_TOKENS to see supported tokens.`
                    }
                };
            }

            const estimatedFee = 0.01 + ((args.priorityFee || 0) / 1000000 / 1_000_000_000 * 5000);
            console.log(`[KAMINO TOOL DEPOSIT] Estimated fee: ${estimatedFee} SOL`);
            console.log(`[KAMINO TOOL DEPOSIT] Checking balance for token: ${tokenAddress}`);

            if (!enoughMoney(balance, args.amount, tokenAddress, estimatedFee)) {
                console.error(`[KAMINO TOOL DEPOSIT] Insufficient balance`);
                return {
                    resForAi: {
                        status: "error",
                        error: `Insufficient ${args.token} balance. Need ${args.amount} ${args.token} + ${estimatedFee} SOL for fees`
                    }
                };
            }

            console.log(`[KAMINO TOOL DEPOSIT] Balance check passed`);
            console.log(`[KAMINO TOOL DEPOSIT] Calling kaminoDeposit with:`, {
                token: args.token,
                amount: args.amount,
                priorityFee: args.priorityFee || 0,
                walletAddress: keypair.publicKey.toBase58()
            });

            const signature = await kaminoDeposit(keypair, args);

            console.log(`[KAMINO TOOL DEPOSIT] Success! Signature: ${signature}`);
            return {
                resForAi: {
                    status: "success",
                    transactionId: signature,
                    operation: "deposit",
                    token: args.token,
                    amount: args.amount,
                    priorityFee: args.priorityFee || 0,
                    message: `Successfully deposited ${args.amount} ${args.token}${args.priorityFee ? ` with priority fee ${args.priorityFee} µLamports` : ""}`
                },
                resForStatus: {
                    status: "success",
                    transactionId: signature,
                    operation: "deposit",
                    token: args.token,
                    amount: args.amount
                }
            };
        } catch (error: any) {
            console.error(`[KAMINO TOOL DEPOSIT ERROR] Operation failed:`, error);
            console.error(`[KAMINO TOOL DEPOSIT ERROR] Error message:`, error?.message);
            console.error(`[KAMINO TOOL DEPOSIT ERROR] Error stack:`, error?.stack);
            console.error(`[KAMINO TOOL DEPOSIT ERROR] Error logs:`, error?.logs);
            console.error(`[KAMINO TOOL DEPOSIT ERROR] Full error object:`, JSON.stringify(error, null, 2));

            return {
                resForAi: {
                    status: "error",
                    error: error.message || "Deposit operation failed",
                    details: {
                        originalError: error?.message,
                        logs: error?.logs,
                        token: args.token,
                        amount: args.amount,
                        priorityFee: args.priorityFee || 0
                    }
                }
            };
        }
    },

    KAMINO_LEND_WITHDRAW: async (args: KaminoWithdrawParams, keypair?: Keypair, user?: any) => {
        console.log(`[KAMINO TOOL WITHDRAW] Called with args:`, JSON.stringify(args, null, 2));
        console.log(`[KAMINO TOOL WITHDRAW] Keypair present: ${!!keypair}`);
        console.log(`[KAMINO TOOL WITHDRAW] User present: ${!!user}`);

        if (!keypair) {
            console.error(`[KAMINO TOOL WITHDRAW] No keypair provided`);
            return {
                resForAi: {
                    status: "error",
                    error: "Keypair is required for withdraw operations"
                }
            };
        }

        if (!user) {
            console.error(`[KAMINO TOOL WITHDRAW] No user provided`);
            return {
                resForAi: {
                    status: "error",
                    error: "User is required for balance checks"
                }
            };
        }

        try {
            console.log(`[KAMINO TOOL WITHDRAW] Checking user balance for fees`);
            const balance = await getBalances(user);

            const estimatedFee = 0.01 + ((args.priorityFee || 0) / 1000000 / 1_000_000_000 * 5000);
            console.log(`[KAMINO TOOL WITHDRAW] Estimated fee: ${estimatedFee} SOL`);

            if (!enoughMoney(balance, 0, "So11111111111111111111111111111111111111112", estimatedFee)) {
                console.error(`[KAMINO TOOL WITHDRAW] Insufficient SOL for fees`);
                return {
                    resForAi: {
                        status: "error",
                        error: `Insufficient SOL balance for fees. Need ${estimatedFee} SOL for transaction fees`
                    }
                };
            }

            console.log(`[KAMINO TOOL WITHDRAW] Balance check passed`);
            const signature = await kaminoWithdraw(keypair, args);
            return {
                resForAi: {
                    status: "success",
                    transactionId: signature,
                    operation: "withdraw",
                    token: args.token,
                    amount: args.amount,
                    priorityFee: args.priorityFee || 0,
                    message: `Successfully withdrew ${args.amount} ${args.token}${args.priorityFee ? ` with priority fee ${args.priorityFee} µLamports` : ""}`
                },
                resForStatus: {
                    status: "success",
                    transactionId: signature,
                    operation: "withdraw",
                    token: args.token,
                    amount: args.amount
                }
            };
        } catch (error: any) {
            return {
                resForAi: {
                    status: "error",
                    error: error.message || "Withdraw operation failed"
                }
            };
        }
    },

    KAMINO_LEND_BORROW: async (args: KaminoBorrowParams, keypair?: Keypair, user?: any) => {
        console.log(`[KAMINO TOOL BORROW] Called with args:`, JSON.stringify(args, null, 2));
        console.log(`[KAMINO TOOL BORROW] Keypair present: ${!!keypair}`);
        console.log(`[KAMINO TOOL BORROW] User present: ${!!user}`);

        if (!keypair) {
            console.error(`[KAMINO TOOL BORROW] No keypair provided`);
            return {resForAi: {status: "error", error: "Keypair is required for borrow"}};
        }

        if (!user) {
            console.error(`[KAMINO TOOL BORROW] No user provided`);
            return {
                resForAi: {
                    status: "error",
                    error: "User is required for balance checks"
                }
            };
        }

        try {
            console.log(`[KAMINO TOOL BORROW] Checking user balance for fees`);
            const balance = await getBalances(user);

            const estimatedFee = 0.01 + ((args.priorityFee || 0) / 1000000 / 1000000000 * 5000);
            console.log(`[KAMINO TOOL BORROW] Estimated fee: ${estimatedFee} SOL`);

            if (!enoughMoney(balance, 0, "So11111111111111111111111111111111111111112", estimatedFee)) {
                console.error(`[KAMINO TOOL BORROW] Insufficient SOL for fees`);
                return {
                    resForAi: {
                        status: "error",
                        error: `Insufficient SOL balance for fees. Need ${estimatedFee} SOL for transaction fees`
                    }
                };
            }

            console.log(`[KAMINO TOOL BORROW] Balance check passed`);
            const tx = await kaminoBorrow(keypair, args);
            return {
                resForAi: {
                    status: "success",
                    transactionId: tx,
                    operation: "borrow",
                    token: args.token,
                    amount: args.amount,
                    priorityFee: args.priorityFee || 0,
                    message: `Successfully borrowed ${args.amount} ${args.token}${args.priorityFee ? ` with priority fee ${args.priorityFee} µLamports` : ""}`
                },
                resForStatus: {
                    status: "success",
                    transactionId: tx,
                    operation: "borrow",
                    token: args.token,
                    amount: args.amount
                }
            };
        } catch (e: any) {
            return {resForAi: {status: "error", error: e.message || String(e)}};
        }
    },

    KAMINO_LEND_REPAY: async (args: KaminoRepayParams, keypair?: Keypair, user?: any) => {
        console.log(`[KAMINO TOOL REPAY] Called with args:`, JSON.stringify(args, null, 2));
        console.log(`[KAMINO TOOL REPAY] Keypair present: ${!!keypair}`);
        console.log(`[KAMINO TOOL REPAY] User present: ${!!user}`);

        if (!keypair) {
            console.error(`[KAMINO TOOL REPAY] No keypair provided`);
            return {resForAi: {status: "error", error: "Keypair is required for repay"}};
        }

        if (!user) {
            console.error(`[KAMINO TOOL REPAY] No user provided`);
            return {
                resForAi: {
                    status: "error",
                    error: "User is required for balance checks"
                }
            };
        }

        try {
            console.log(`[KAMINO TOOL REPAY] Checking user balance`);
            const balance = await getBalances(user);

            const tokenAddress = await resolveTokenMint(args.token);
            if (!tokenAddress) {
                return {
                    resForAi: {
                        status: "error",
                        error: `Token ${args.token} is not supported in Kamino. Use KAMINO_GET_AVAILABLE_TOKENS to see supported tokens.`
                    }
                };
            }

            const estimatedFee = 0.01 + ((args.priorityFee || 0) / 1000000 / 1_000_000_000 * 5000);
            console.log(`[KAMINO TOOL REPAY] Estimated fee: ${estimatedFee} SOL`);
            console.log(`[KAMINO TOOL REPAY] Checking balance for token: ${tokenAddress}`);

            if (!enoughMoney(balance, args.amount, tokenAddress, estimatedFee)) {
                console.error(`[KAMINO TOOL REPAY] Insufficient balance`);
                return {
                    resForAi: {
                        status: "error",
                        error: `Insufficient ${args.token} balance. Need ${args.amount} ${args.token} + ${estimatedFee} SOL for fees`
                    }
                };
            }

            console.log(`[KAMINO TOOL REPAY] Balance check passed`);
            const tx = await kaminoRepay(keypair, args);
            return {
                resForAi: {
                    status: "success",
                    transactionId: tx,
                    operation: "repay",
                    token: args.token,
                    amount: args.amount,
                    priorityFee: args.priorityFee || 0,
                    message: `Successfully repaid ${args.amount} ${args.token}${args.priorityFee ? ` with priority fee ${args.priorityFee} µLamports` : ""}`
                },
                resForStatus: {
                    status: "success",
                    transactionId: tx,
                    operation: "repay",
                    token: args.token,
                    amount: args.amount
                }
            };
        } catch (e: any) {
            return {resForAi: {status: "error", error: e.message || String(e)}};
        }
    },

    KAMINO_LEND_HEALTH: async (args: { user: string }) => {
        try {
            const h = await kaminoHealth(args.user);
            const md = [
                `### Kamino Health`,
                `User: \`${args.user}\``,
                `- LTV: ${(h.ltv * 100).toFixed(2)}%`,
                `- Liquidation LTV: ${(h.liquidationLtv * 100).toFixed(2)}%`,
                `- Borrow limit: $${h.borrowLimitUsd.toFixed(6)}`,
                `- Net account value: $${h.netAccountValueUsd.toFixed(6)}`
            ].join("\n");
            return {resForAi: {status: "success", health: h, message: md}};
        } catch (e: any) {
            return {resForAi: {status: "error", error: e.message || String(e)}};
        }
    },

    KAMINO_GET_AVAILABLE_TOKENS: async () => {
        try {
            const tokens = await getAllAvailableTokens();
            const limitedTokens = tokens.slice(0, 100);
            const tokenList = limitedTokens.map(token => ({
                symbol: token.symbol,
                mint: token.address,
                logoURI: token.logoURI || "no_URI"
            }));

            const md = [
                `### 🪙 Available Tokens in Kamino (${tokenList.length} of ${tokens.length} total)`,
                ``,
                `**Top tokens by popularity:**`,
                ...tokenList.slice(0, 20).map(t => `- **${t.symbol}** \`${t.mint}\``),
                tokenList.length > 20 ? `\n*... and ${tokenList.length - 20} more tokens*` : "",
                `\n*Showing first 100 tokens. Use KAMINO_CHECK_TOKEN_SUPPORT to check specific tokens.*`
            ].join("\n");

            return {
                resForAi: {
                    status: "success",
                    tokens: tokenList,
                    totalCount: tokens.length,
                    shownCount: tokenList.length,
                    message: md
                }
            };
        } catch (e: any) {
            return {resForAi: {status: "error", error: e.message || String(e)}};
        }
    },

    KAMINO_CHECK_TOKEN_SUPPORT: async (args: { token: string }) => {
        try {
            const isSupported = await isTokenSupported(args.token);
            const mint = await resolveTokenMint(args.token);

            const md = isSupported
                ? `✅ **${args.token}** is supported in Kamino\nMint: \`${mint}\``
                : `❌ **${args.token}** is not supported in Kamino`;

            return {
                resForAi: {
                    status: "success",
                    supported: isSupported,
                    token: args.token,
                    mint: mint || null,
                    message: md
                }
            };
        } catch (e: any) {
            return {resForAi: {status: "error", error: e.message || String(e)}};
        }
    },

    KAMINO_GET_TOKEN_METRICS: async (args: { token: string }) => {
        try {
            const mint = await resolveTokenMint(args.token);
            if (!mint) {
                return {
                    resForAi: {
                        status: "error",
                        error: `Token ${args.token} is not supported in Kamino`
                    }
                };
            }

            const {buildKaminoCreditBureau} = await import("./panel");
            const bureau = await buildKaminoCreditBureau();
            const tokenData = bureau.rows.find(
                row => row.mint === mint || row.symbol.toUpperCase() === args.token.toUpperCase()
            );

            if (!tokenData) {
                return {
                    resForAi: {
                        status: "error",
                        error: `No metrics found for token ${args.token}`
                    }
                };
            }

            const md = [
                `### 📊 ${tokenData.symbol} Metrics`,
                `- **Symbol:** ${tokenData.symbol}`,
                `- **Mint:** \`${tokenData.mint}\``,
                `- **Liquidation LTV:** ${tokenData.liqLtv || "N/A"}%`,
                `- **Supply APY:** ${tokenData.supplyApy || "N/A"}%`,
                `- **Borrow APY:** ${tokenData.borrowApy || "N/A"}%`,
                `- **Total Supply:** $${tokenData.totalSupplyUsd.toLocaleString()}`,
                `- **Total Borrow:** $${tokenData.totalBorrowUsd.toLocaleString()}`
            ].join("\n");

            return {
                resForAi: {
                    status: "success",
                    metrics: tokenData,
                    message: md
                }
            };
        } catch (e: any) {
            return {resForAi: {status: "error", error: e.message || String(e)}};
        }
    }
}