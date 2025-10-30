import { User } from "@privy-io/server-auth";
import { addActivity } from "../services/mongoService";

type ToolFn = (args: any, keypair?: any, user?: User) => Promise<any>;

type ActivityTokenForDb = {
    address: string;
    symbol?: string | null;
    decimals?: number | null;
};

type ActivityBuilder = (args: any, raw: any) => Promise<null | {
    amount?: number | null;
    token?: { symbol?: string | null; address?: string | null; decimals?: number | null };
    txid?: string | null;
    meta?: any;
    usdAmount?: number | null;
}>;

function detectSuccess(raw: any): boolean {
    const st = raw?.resForStatus ?? raw?.resForAi ?? raw;
    if (!st) return false;

    if (st.status && String(st.status).toLowerCase() === "success") return true;

    const ids = [
        st.transactionId,
        st.signature,
        Array.isArray(st.signatures) ? st.signatures[0] : undefined,
        st.id,
        Array.isArray(st.id) ? st.id[0] : undefined,
    ].filter(Boolean);

    if (ids.length > 0) return true;

    if (st.finalAmountOfSolOnPosition != null) return true;

    return false;
}

export function withBalanceEffects(
    toolName: string,
    handler: ToolFn,
    buildActivity?: ActivityBuilder
): ToolFn {
    return async (args, keypair, user) => {
        const raw = await handler(args, keypair, user);

        const ok = detectSuccess(raw);
        if (ok) {
            const st = raw?.resForStatus ?? {};
            raw.resForStatus = { ...st, needToBalance: 2 };
        }

        if (user && buildActivity) {
            try {
                const entry = await buildActivity(args, raw);
                if (entry) {
                    let tokenForDb: ActivityTokenForDb | undefined = undefined;
                    if (entry.token && typeof entry.token.address === "string" && entry.token.address.length > 0) {
                        tokenForDb = {
                            address: entry.token.address,
                            symbol: entry.token.symbol ?? null,
                            decimals: entry.token.decimals ?? null,
                        };
                    }

                    await addActivity(user, {
                        tool: toolName,
                        success: ok,
                        amount: entry.amount ?? undefined,
                        token: tokenForDb,
                        txid: entry.txid ?? undefined,
                        meta: entry.meta ?? undefined,
                        usdAmount: entry.usdAmount ?? undefined,
                    });
                }
            } catch (e) {
                console.log(`[activity-log][${toolName}] failed:`, e);
            }
        }

        return raw;
    };
}