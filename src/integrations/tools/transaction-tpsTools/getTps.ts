import {Connection, Keypair} from "@solana/web3.js";

export async function GET_TPS (args: any, keypair?: Keypair) {
    console.log(`[HANDLER GET_TPS] Attempting to get tps solana network`);
    try{
        const connection = new Connection(process.env.RPC_URL!)
        const samples = await connection.getRecentPerformanceSamples(1); // 1 min

        if (!samples || samples.length === 0) {
            return { error: "Could not retrieve performance samples." };
        }
        const currentTps = samples[0].numTransactions / samples[0].samplePeriodSecs;

        return {
            resForAi: {tps: Math.round(currentTps)}
        };

    }catch (error:any) {
        console.error(`[GET_TPS] Error:`, error);
        return { resForAi: {error: `Failed to get TPS: ${error.message}`}};
    }
}