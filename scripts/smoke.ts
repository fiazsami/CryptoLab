/**
 * End-to-end check against live Binance.US: boots the real server on a free
 * port (no frontend), then acts as a browser tab.
 *
 *   npm run smoke                 BTCUSDT
 *   npm run smoke -- ETHUSDT
 *
 * Passes when the API answers and every message type arrives for the pair within
 * the timeout. A quiet pair can legitimately go 30s without a trade, so use a
 * liquid one.
 */
import WebSocket from "ws";
import { startServer } from "../server/app.ts";
import type { ServerMessage } from "../shared/protocol.ts";

const symbol = (process.argv[2] ?? "BTCUSDT").toUpperCase();
const TIMEOUT_MS = 30_000;
const wanted = ["hello", "subscribed", "markets", "book", "quote", "trades", "candle"] as const;

const server = await startServer({ port: 0, host: "127.0.0.1", frontend: "none", log: (m) => console.log(`  server · ${m}`) });
let failed = false;

try {
    const pairs = (await (await fetch(`${server.url}/api/pairs`)).json()) as { pairs: { symbol: string }[] };
    check(pairs.pairs.some((p) => p.symbol === symbol), `/api/pairs lists ${symbol} (${pairs.pairs.length} pairs)`);

    const klines = (await (await fetch(`${server.url}/api/klines?symbol=${symbol}&limit=5`)).json()) as { candles: unknown[] };
    check(klines.candles?.length === 5, "/api/klines returns 5 candles");

    const missing = await fetch(`${server.url}/api/klines?symbol=NOTAPAIR`);
    check(missing.status === 404, "/api/klines 404s an unlisted pair");

    const seen = new Map<string, number>();
    const started = Date.now();
    const ws = new WebSocket(`${server.url.replace("http", "ws")}/ws`);

    await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, TIMEOUT_MS);
        ws.on("open", () => {
            ws.send(JSON.stringify({ type: "markets", on: true }));
            ws.send(JSON.stringify({ type: "subscribe", symbol }));
        });
        ws.on("message", (raw) => {
            const msg = JSON.parse(String(raw)) as ServerMessage;
            if (msg.type === "error") console.log(`  error frame: ${msg.message}`);
            if (!seen.has(msg.type)) seen.set(msg.type, Date.now() - started);
            if (wanted.every((t) => seen.has(t))) {
                clearTimeout(timer);
                resolve();
            }
        });
    });

    for (const type of wanted) {
        const at = seen.get(type);
        check(at !== undefined, `${type.padEnd(10)} ${at === undefined ? `not received in ${TIMEOUT_MS / 1000}s` : `after ${at}ms`}`);
    }

    const health = (await (await fetch(`${server.url}/api/health`)).json()) as { streams: string[] };
    check(health.streams.includes(`${symbol.toLowerCase()}@depth20@100ms`), `/api/health shows ${health.streams.length} upstream streams`);

    ws.close();
} catch (error) {
    failed = true;
    console.log(`✗ ${error instanceof Error ? error.message : String(error)}`);
} finally {
    await server.close();
}

console.log(failed ? "\nSMOKE FAILED" : "\nSMOKE PASSED");
process.exit(failed ? 1 : 0);

function check(ok: boolean, label: string): void {
    console.log(`${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed = true;
}
