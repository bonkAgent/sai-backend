import { Keypair } from '@solana/web3.js';
import { PrivyClient, User } from '@privy-io/server-auth';
import CryptoJS from 'crypto-js';
import {createUser, decryptDeterministic} from './mongoService';

const privy = new PrivyClient(
    process.env.PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
);

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET!;

export async function getKaelusPrivateKey(user: User): Promise<Keypair> {

    const existingPrivateKey = user.customMetadata?.privateKey;

    if (existingPrivateKey) {
        const decryptedBase64 = CryptoJS.AES.decrypt(String(existingPrivateKey), ENCRYPTION_SECRET)
            .toString(CryptoJS.enc.Utf8);
        const byteArray = Uint8Array.from(atob(decryptedBase64), c => c.charCodeAt(0));

        return Keypair.fromSecretKey(byteArray);
    }

    const keypair = Keypair.generate();
    const secretKey = keypair.secretKey;

    const encrypted = CryptoJS.AES.encrypt(
        CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.create(secretKey)),
        ENCRYPTION_SECRET
    ).toString();

    await createUser(user.id);
    await privy.setCustomMetadata(user.id, { privateKey: encrypted });

    return keypair;
}

export async function start(user: User): Promise<any> {

    const existingPrivateKey = user.customMetadata?.privateKey;
    if (existingPrivateKey) {
        const decryptedBase64 = CryptoJS.AES.decrypt(String(existingPrivateKey), ENCRYPTION_SECRET)
            .toString(CryptoJS.enc.Utf8);

        // В Node используем Buffer, а не atob
        const byteArray = new Uint8Array(Buffer.from(decryptedBase64, 'base64'));
        return {keypair: Keypair.fromSecretKey(byteArray), new: false};
    }

    const keypair = Keypair.generate();
    const secretKey = keypair.secretKey;

    const encrypted = CryptoJS.AES.encrypt(
        CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.create(secretKey)),
        ENCRYPTION_SECRET
    ).toString();

    await createUser(user.id);
    await privy.setCustomMetadata(user.id, { privateKey: encrypted });

    return {keypair, new: true};
}

// ----- Перегрузки + реализация -----
export function getPrivyUser(accessToken: string): Promise<User>;
export function getPrivyUser(user: User): Promise<User>;

export async function getPrivyUser(arg: string | User): Promise<User> {
    if (typeof arg === "string") {
        const { userId } = await privy.verifyAuthToken(arg);
        return await privy.getUserById(userId);
    } else {
        const userId = arg.id;
        return await privy.getUserById(userId);
    }
}

export async function getPrivyUserById(userId:string){
    const id = await decryptDeterministic(userId)
    return await privy.getUserById(id);
}