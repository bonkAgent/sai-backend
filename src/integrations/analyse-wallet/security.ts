import crypto from "crypto";

const KEY_SECRET = process.env.KEY_DERIVATION_SECRET || "";
if (!KEY_SECRET) throw new Error("Missing KEY_DERIVATION_SECRET");

export function pid(input: string): string {
    const mac = crypto.createHmac("sha256", KEY_SECRET).update(input, "utf8").digest("hex");
    return mac.slice(0, 48);
}