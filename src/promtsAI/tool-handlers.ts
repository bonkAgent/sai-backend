import { Keypair } from '@solana/web3.js';
import { User } from '@privy-io/server-auth';
import { KAMINO_TOOL_HANDLERS } from "../integrations/kamino/kaminoTools";
import { METEORA_TOOL_HANDLERS } from "../integrations/meteora/meteoraTools";
import { MISSIONS_TOOL_HANDLERS } from "../missions/missionsTools";
export type ToolHandler = (args: any, keypair?: Keypair, user?: User) => any | Promise<any>;
import { tryFetchFromSolanaTracker } from "../integrations/token-analysis/sources/solanatracker";
import { assessRugpull } from "../integrations/token-analysis/sources/rugcheck";
import { getHolderScanData } from "../integrations/token-analysis/sources/holderscan";
import { getTokenDataHandler } from "../integrations/token-analysis/tokenAnalyse";
import {ANALYZE_WALLET_TOOL} from "../integrations/analyse-wallet/tool";
import {LUNAR_TOOLS} from "../integrations/lunarcrush/tool";
import {withBalanceEffects} from "../utils/withBalanceEffects";
import {
  buildDepositBorrowActivity,
  buildKaminoLendActivity,
  buildStakeActivity,
  buildSwapActivity,
  buildTransferActivity
} from "../utils/activityBuilders";
import {TRENDING_TOKENS_TOOL} from "../integrations/solanatracker/trendingTool";
import {FETCH_PRICE} from "../integrations/tools/priceTools/fetchPrice";
import {GET_PORTFOLIO_VALUE} from "../integrations/tools/balanceTools/portfolio-value";
import {GET_BALANCE} from "../integrations/tools/balanceTools/balance";
import {TRANSFER_TOKENS} from "../integrations/tools/swap-transferTools/transfer";
import {SWAP} from "../integrations/tools/swap-transferTools/swap";
import {DELETE_FRIEND, GET_FRIENDS, SET_FRIEND} from "../integrations/tools/friendsTools/friends";
import {GET_TRANSACTION_HISTORY} from "../integrations/tools/transaction-tpsTools/transactionHistory";
import {GET_TPS} from "../integrations/tools/transaction-tpsTools/getTps";
import {LIST_STAKING_OPTIONS, STAKE, UNSTAKE} from "../integrations/tools/stakeTools/stake";
import {CREATE_TOKEN} from "../integrations/tools/createTokenTools/createToken";

export const TOOL_HANDLERS: Record<string, ToolHandler> = {


    FETCH_PRICE: FETCH_PRICE,
    GET_PORTFOLIO_VALUE: GET_PORTFOLIO_VALUE,
    GET_BALANCE: GET_BALANCE,
    TRANSFER_TOKENS: TRANSFER_TOKENS,
    SWAP: SWAP,
    GET_FRIENDS: GET_FRIENDS,
    SET_FRIEND: SET_FRIEND,
    DELETE_FRIEND: DELETE_FRIEND,
    GET_TRANSACTION_HISTORY: GET_TRANSACTION_HISTORY,
    GET_TPS: GET_TPS,
    LIST_STAKING_OPTIONS: LIST_STAKING_OPTIONS,
    STAKE: STAKE,
    UNSTAKE: UNSTAKE,
    CREATE_TOKEN: CREATE_TOKEN,
    ANALYZE_WALLET: ANALYZE_WALLET_TOOL,
    ...KAMINO_TOOL_HANDLERS,
    ...METEORA_TOOL_HANDLERS,
    ...MISSIONS_TOOL_HANDLERS,
    ...LUNAR_TOOLS,
    TRENDING_TOKENS: TRENDING_TOKENS_TOOL,

  GET_TOKEN_DATA: async (args: { ticker: string }, kp?: Keypair, user?: User) => {
    return getTokenDataHandler(args, kp, user);
  },

  HOLDERSCAN_FUNCTION: async (args: { ticker: string }, _kp?: Keypair, user?: User) => {
    if (!args?.ticker) {
      return { resForAi: { error: "Ticker or mint address is required" } };
    }
    try {
      const holderScan = await getHolderScanData(args.ticker);
      return {
        resForAi: holderScan,
      };
    } catch (e: any) {
      return { resForAi: { error: `HOLDERSCAN_FUNCTION failed: ${e.message}` } };
    }
  },

  SECURITY_FUNCTION: async (args: { ticker: string }, _kp?: Keypair, user?: User) => {
    if (!args?.ticker) {
      return { resForAi: { error: "Ticker or mint address is required" } };
    }
    try {
      const [security, stBundle] = await Promise.all([
        assessRugpull(args.ticker, {}),
        tryFetchFromSolanaTracker(args.ticker),
      ]);

      return {
        resForAi: {
          security,
          solanaTracker: stBundle,
        },
      };
    } catch (e: any) {
      return { resForAi: { error: `SECURITY_FUNCTION failed: ${e.message}` } };
    }
  },
}

TOOL_HANDLERS.TRANSFER_TOKENS = withBalanceEffects(
    "TRANSFER_TOKENS",
    TOOL_HANDLERS.TRANSFER_TOKENS,
    buildTransferActivity
);

TOOL_HANDLERS.SWAP = withBalanceEffects(
    "SWAP",
    TOOL_HANDLERS.SWAP,
    buildSwapActivity
);

TOOL_HANDLERS.STAKE = withBalanceEffects(
    "STAKE",
    TOOL_HANDLERS.STAKE,
    buildStakeActivity
);

TOOL_HANDLERS.UNSTAKE = withBalanceEffects(
    "UNSTAKE",
    TOOL_HANDLERS.UNSTAKE,
    buildStakeActivity
);

for (const [name, fn] of Object.entries(TOOL_HANDLERS)) {
  if (name.startsWith("KAMINO_LEND_")) {
    TOOL_HANDLERS[name] = withBalanceEffects(
        name,
        fn,
        buildKaminoLendActivity(name.replace("KAMINO_LEND_", ""))
    );
  }
}

if (TOOL_HANDLERS.DEPOSIT) {
  TOOL_HANDLERS.DEPOSIT = withBalanceEffects(
      "DEPOSIT",
      TOOL_HANDLERS.DEPOSIT,
      buildDepositBorrowActivity
  );
}
if (TOOL_HANDLERS.BORROW) {
  TOOL_HANDLERS.BORROW = withBalanceEffects(
      "BORROW",
      TOOL_HANDLERS.BORROW,
      buildDepositBorrowActivity
  );
}

for (const [name, fn] of Object.entries(TOOL_HANDLERS)) {
  if (
      name.startsWith("ADD_METEORA_") ||
      name.startsWith("REMOVE_METEORA_") ||
      name.startsWith("REBALANCE_METEORA_") ||
      name.startsWith("CLOSE_METEORA_") ||
      name.startsWith("CLAIM_METEORA_")
  ) {
    TOOL_HANDLERS[name] = withBalanceEffects(name, fn, async (_args, raw) => {
      const st = raw?.resForStatus ?? raw?.resForAi ?? null;
      if (!st) return null;

      const txid =
          st.transactionId ||
          st.signature ||
          (Array.isArray(st.signatures) ? st.signatures[0] : undefined) ||
          (Array.isArray(st.id) ? st.id[0] : st.id) ||
          null;

      return {
        txid,
        meta: st,
      };
    });
  }
}
