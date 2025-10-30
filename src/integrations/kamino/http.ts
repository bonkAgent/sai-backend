export const KAMINO_API = "https://api.kamino.finance";

export async function kaminoGetJson(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>
): Promise<any> {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, KAMINO_API);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (v !== undefined && v !== null && v !== "") {
                url.searchParams.set(k, String(v));
            }
        }
    }

    const r = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`Kamino HTTP ${r.status} ${r.statusText}: ${text}`);
    }
    return r.json();
}