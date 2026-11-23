import type http from "node:http";
import type { Hub } from "./hub.ts";
import type { MarketSource } from "./sources/types.ts";

/**
 * The JSON API. Returns false for anything outside /api/ so the caller can hand
 * the request to the frontend (Vite in development, static files in production).
 */

const INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

export function createApi(source: MarketSource, hub: Hub, log: (message: string) => void) {
    return function handle(req: http.IncomingMessage, res: http.ServerResponse): boolean {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return false;

        if (req.method !== "GET") {
            json(res, 405, { error: "method not allowed" });
            return true;
        }

        switch (url.pathname) {
            case "/api/pairs":
                json(res, 200, { exchange: source.name, pairs: source.pairs() });
                return true;

            case "/api/health":
                json(res, 200, hub.health());
                return true;

            case "/api/klines": {
                const symbol = url.searchParams.get("symbol") ?? "";
                const interval = url.searchParams.get("interval") ?? "1m";
                const limit = Number(url.searchParams.get("limit") ?? 500);
                const pair = source.pair(symbol);
                if (!pair) {
                    json(res, 404, { error: `${symbol || "(none)"} is not listed on ${source.name}` });
                    return true;
                }
                if (!INTERVALS.has(interval)) {
                    json(res, 400, { error: `interval must be one of ${[...INTERVALS].join(", ")}` });
                    return true;
                }
                if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
                    json(res, 400, { error: "limit must be an integer from 1 to 1000" });
                    return true;
                }
                source
                    .candles(pair.symbol, interval, limit)
                    .then((candles) => json(res, 200, { symbol: pair.symbol, interval, candles }))
                    .catch((error: unknown) => {
                        const message = error instanceof Error ? error.message : String(error);
                        log(`klines ${pair.symbol} failed: ${message}`);
                        json(res, 502, { error: `upstream request failed: ${message}` });
                    });
                return true;
            }

            default:
                json(res, 404, { error: "not found" });
                return true;
        }
    };
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
    if (res.headersSent) return;
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
}
