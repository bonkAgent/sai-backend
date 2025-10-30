import util from "util";

type Level = "silent"|"error"|"warn"|"info"|"debug"|"trace";
const LV: Record<Level, number> = { silent:0, error:10, warn:20, info:30, debug:40, trace:50 };

const CUR_LEVEL: Level =
    (process.env.LOG_LEVEL as Level) ||
    (process.env.NODE_ENV === "production" ? "info" : "debug");

const NS_FILTER = (process.env.LOG_NS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

const enabledNS = (ns: string) => NS_FILTER.length === 0 || NS_FILTER.includes(ns);

function out(ns: string, level: Level, args: any[]) {
    if (!enabledNS(ns)) return;
    if (LV[level] > LV[CUR_LEVEL]) return;

    const time = new Date().toISOString();
    const msg = args.length === 1 ? args[0] : util.format.apply(null, args as any);
    const line = `[${time}] [${level.toUpperCase()}] [${ns}] ${typeof msg === "string" ? msg : JSON.stringify(msg)}`;

    if (level === "error")      console.error(line);
    else if (level === "warn")  console.warn(line);
    else                        console.log(line);
}

export function createLogger(ns: string) {
    return {
        error: (...a:any[]) => out(ns, "error", a),
        warn : (...a:any[]) => out(ns, "warn" , a),
        info : (...a:any[]) => out(ns, "info" , a),
        debug: (...a:any[]) => out(ns, "debug", a),
        trace: (...a:any[]) => out(ns, "trace", a),
        child: (suffix: string) => createLogger(`${ns}:${suffix}`)
    };
}

export function sample<T extends (...a:any[])=>void>(fn: T, everyN = 10): T {
    let i = 0;
    return ((...a:any[]) => { if ((i++ % everyN) === 0) fn(...a); }) as T;
}

export function timer(label: string, log = createLogger("TIMER")) {
    const t0 = process.hrtime.bigint();
    return {
        end(extra?: Record<string, any>) {
            const ms = Number(process.hrtime.bigint() - t0) / 1e6;
            log.debug(`${label} done in ${ms.toFixed(1)}ms${extra ? " " + JSON.stringify(extra) : ""}`);
            return ms;
        }
    };
}