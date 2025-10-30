import helmet from "helmet";
import cors from "cors";
import hpp from "hpp";
import mongoSanitize from "express-mongo-sanitize";
import type { Request } from "express";
import crypto from "crypto";
import rateLimit, { ValueDeterminingMiddleware, ipKeyGenerator } from "express-rate-limit";


export const ALLOWED_ORIGINS: (string | RegExp)[] = [
    "https://james-bonk.netlify.app",
    "http://localhost:5173",
    "http://localhost:5168",
    "https://solana-agent-1ftl.onrender.com"
];

export const corsStrict = cors({
    origin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
        if (!origin) return cb(null, true);
        const ok = ALLOWED_ORIGINS.some((o) => (typeof o === "string" ? o === origin : o.test(origin)));
        return cb(ok ? null : new Error("CORS blocked"), ok);
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: false,
    maxAge: 86400
});

export const hardenHeaders = helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
    hidePoweredBy: true
});

export const preventParamPollution = hpp();
export const preventMongoInjection = mongoSanitize({ replaceWith: "_" });

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");


const getClientIp = (req: Request): string => {
    const xff = req.headers["x-forwarded-for"];
    const fromXff =
        Array.isArray(xff) ? xff[0] : (typeof xff === "string" ? xff.split(",")[0]?.trim() : undefined);

    return (
        req.ip ||
        fromXff ||
        req.socket?.remoteAddress ||
        "127.0.0.1" // безопасный дефолт
    );
};

export const clientKey: ValueDeterminingMiddleware<string> = (req, _res) => {
    const auth = req.headers?.authorization;
    if (auth?.startsWith("Bearer ")) return "tok:" + sha(auth.slice(7));
    return "ip:" + ipKeyGenerator(getClientIp(req));
};

export const limiterGlobal = rateLimit({
    windowMs: 60_000,
    limit: 1000,
    keyGenerator: (req, _res) => ipKeyGenerator(getClientIp(req)),
    standardHeaders: true,
    legacyHeaders: false
});

export const limiterChat = rateLimit({
    windowMs: 60_000,
    limit: 60,
    keyGenerator: clientKey,
    standardHeaders: true,
    legacyHeaders: false
});

export const limiterTransfer = rateLimit({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: clientKey,
    standardHeaders: true,
    legacyHeaders: false
});