import { normalizeSymbol } from "../../../shared/symbols.ts";

export type Route = { name: "markets" } | { name: "pair"; symbol: string } | { name: "missing"; path: string };

export function parseRoute(pathname: string): Route {
    if (pathname === "/" || pathname === "") return { name: "markets" };
    const match = /^\/pair\/([^/]+)\/?$/.exec(pathname);
    if (match?.[1]) {
        let segment: string;
        try {
            segment = decodeURIComponent(match[1]);
        } catch {
            return { name: "missing", path: pathname };
        }
        const symbol = normalizeSymbol(segment);
        if (symbol) return { name: "pair", symbol };
    }
    return { name: "missing", path: pathname };
}

export function pairPath(symbol: string): string {
    return `/pair/${normalizeSymbol(symbol)}`;
}
