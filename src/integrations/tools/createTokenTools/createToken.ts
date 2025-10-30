import {Keypair} from "@solana/web3.js";
import {User} from "@privy-io/server-auth";
import {getBalances} from "../../../services/mongoService";
import {enoughMoney} from "../../../utils/enoughMoney";
import {launchToken, launchTokenWithBuy} from "../../../services/raydiumService";
import {prepareIpfs} from "./utils";

export async function CREATE_TOKEN (
    args: {
        name: string;
        symbol: string;
        description: string;
        tokenSuply?: number;
        quoteRaising?: number;
        amountToBuy?: number;
        twitter?: string;
        telegram?: string;
        website?: string;
        imageUrl?: string;
    },
    keypair?: Keypair,
    user?: User
) {

    const {
        name,
        symbol,
        description,
        tokenSuply = 1_000_000_000,
        quoteRaising = 85,
        amountToBuy = 0,
        twitter = "",
        telegram = "",
        website = "",
        imageUrl = "",
    } = args;
    console.log("ARGS",args)
    if (!user) throw new Error("User is required for UNSTAKE");
    if (!name || !symbol || !description) {
        return {resForAi:"Missing required parameters: name, symbol, description, image_url"};
    }
    if ((!tokenSuply && quoteRaising) || (tokenSuply && !quoteRaising)) {
        return {resForAi:"Missing tokenSuply or quoteRaising"};
    }
    if(tokenSuply && tokenSuply<1_000_000_000){
        return {resForAi:"Token suply must be at least 1 000 000 000"};
    }
    if(quoteRaising && quoteRaising<85){
        return {resForAi:"Quote raising must be at least 85"};
    }
    try {

        const balance = await getBalances(user);
        if(!enoughMoney(balance, amountToBuy, "So11111111111111111111111111111111111111112", 0.04)){
            return {resForAi:{ status: `Error user dont have enough moaney` }}
        }
        const mintKeypair = Keypair.generate();

        const uri = await prepareIpfs({
            name,
            symbol,
            description,
            twitter,
            telegram,
            website,
            imageUrl,
        });

        if (!uri) {
            return {resForAi:"Failed to upload metadata to IPFS"};
        }

        let launchResult;
        if(amountToBuy){
            launchResult = await launchTokenWithBuy(
                keypair!,
                mintKeypair,
                name,
                symbol,
                uri,
                amountToBuy,
                tokenSuply,
                quoteRaising,
            );
        }else{
            launchResult = await launchToken(
                keypair!,
                mintKeypair,
                name,
                symbol,
                uri,
                tokenSuply,
                quoteRaising,
            );
        }

        if (launchResult.error) {
            return {resForAi:`Launch failed: ${launchResult.error}`};
        }

        const { poolState, baseVault, quoteVault, metadata } = launchResult.pdas;

        return {
            resForAi: {
                name,
                symbol,
                mint: mintKeypair.publicKey.toBase58(),
                uri,
                imageUrl,
                poolState: poolState.toBase58(),
                baseVault: baseVault.toBase58(),
                quoteVault: quoteVault.toBase58(),
                metadata: metadata.toBase58(),
            },
            resForStatus: {
                name,
                symbol,
                mint: mintKeypair.publicKey.toBase58(),
                uri,
                imageUrl,
                poolState: poolState.toBase58(),
                baseVault: baseVault.toBase58(),
                quoteVault: quoteVault.toBase58(),
                metadata: metadata.toBase58(),
            },
        };
    } catch (error: any) {
        console.error("[CREATE_TOKEN] Error:", error);
        return {
            resForAi: { status: "error", message: error.message }
        };
    }
}