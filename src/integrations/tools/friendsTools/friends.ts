import {Keypair} from "@solana/web3.js";
import {User} from "@privy-io/server-auth";
import {deleteFriend, getFriends, setFriend} from "../../../services/mongoService";

export async function GET_FRIENDS (args:{}, keypair?: Keypair, user?: User){
    if (!user) throw new Error("User is required for GET_FRIENDS");
    const friends = await getFriends(user);
    return {
        resForAi:{friends},
    }
}

export async function SET_FRIEND (args: { walletAddress: string, name: string }, keypair?: Keypair, user?: User) {
    if (!user) throw new Error("User is required for SET_FRIEND");
    console.log(`[SET FRIEND] setting friend ${args.name}`);
    const status = await setFriend(user, args.name, args.walletAddress);
    return {
        resForAi:{status},
    }
}

export async function DELETE_FRIEND (args: { name: string }, keypair?: Keypair, user?: User) {
    if (!user) throw new Error("User is required for DELETE_FRIEND");
    console.log(`[DELETE FRIEND] deletting friend ${args.name}`);
    const status = await deleteFriend(user, args.name);
    return {
        resForAi: {status},
    };
}