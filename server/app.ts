import http from "node:http";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { ViteDevServer } from "vite";

import { createApi } from "./http.ts";
import { Hub } from "./hub.ts";
import { BinanceSource } from "./sources/binance/index.ts";
import type { MarketSource } from "./sources/types.ts";
import { createStatic } from "./static.ts";

/**
 * One process, one port: the JSON API, the /ws market hub, and the frontend.
 *
 * In development the frontend is Vite in middleware mode, sharing this HTTP
 * server. Vite's HMR socket and our /ws socket therefore share one `upgrade`
 * event. The ws server is created with `noServer` and handed only /ws upgrades;
 * attached with `server:` it would claim every upgrade and break HMR.
 */

export type Frontend = "vite" | "static" | "none";

export interface ServerOptions {
    port: number;
    host: string;
    frontend: Frontend;
    source?: MarketSource;
    log?: (message: string) => void;
}

export interface RunningServer {
    url: string;
    port: number;
    hub: Hub;
    close(): Promise<void>;
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export async function startServer(options: ServerOptions): Promise<RunningServer> {
    const log = options.log ?? (() => {});
    const source =
        options.source ??
        new BinanceSource({
            onLog: (m) => log(`upstream · ${m}`),
            ...(process.env.BINANCE_REST_URL ? { restUrl: process.env.BINANCE_REST_URL } : {}),
            ...(process.env.BINANCE_WS_URL ? { wsUrl: process.env.BINANCE_WS_URL } : {}),
        });

    await source.start();
    log(`${source.name}: ${source.pairs().filter((p) => p.status === "TRADING").length} trading pairs`);

    const hub = new Hub(source, { onLog: (m) => log(`hub · ${m}`) });
    const api = createApi(source, hub, log);

    let frontend: (req: http.IncomingMessage, res: http.ServerResponse) => void = (_req, res) => {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("no frontend in this mode");
    };

    const server = http.createServer((req, res) => {
        if (api(req, res)) return;
        frontend(req, res);
    });

    let vite: ViteDevServer | null = null;
    if (options.frontend === "vite") {
        const { createServer } = await import("vite");
        vite = await createServer({
            configFile: `${ROOT}vite.config.ts`,
            appType: "spa",
            server: { middlewareMode: true, hmr: { server } },
        });
        const middlewares = vite.middlewares;
        frontend = (req, res) =>
            middlewares(req, res, () => {
                res.writeHead(404, { "content-type": "text/plain" });
                res.end("not found");
            });
    } else if (options.frontend === "static") {
        frontend = createStatic(`${ROOT}dist/client`);
    }

    const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
    server.on("upgrade", (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
        const { pathname } = new URL(req.url ?? "/", "http://localhost");
        if (pathname !== "/ws") return; // Vite's HMR listener handles its own.
        if (!sameOrigin(req)) {
            socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            alive.set(ws, true);
            ws.on("pong", () => alive.set(ws, true));
            hub.attach(ws);
        });
    });

    // A browser that vanished without a close frame (sleep, network drop) leaves
    // a half-open socket the hub would keep streaming to. Ping every 30s and drop
    // anything that did not answer the previous ping.
    const alive = new WeakMap<WebSocket, boolean>();
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (alive.get(ws) === false) {
                ws.terminate();
                continue;
            }
            alive.set(ws, false);
            ws.ping();
        }
    }, 30_000);
    heartbeat.unref();

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, options.host, () => {
            server.off("error", reject);
            resolve();
        });
    });

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : options.port;
    const shownHost = options.host === "0.0.0.0" || options.host === "::" ? "localhost" : options.host;

    return {
        url: `http://${shownHost}:${port}`,
        port,
        hub,
        async close() {
            clearInterval(heartbeat);
            hub.close();
            source.close();
            for (const client of wss.clients) client.terminate();
            wss.close();
            await vite?.close();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}

/**
 * Refuses /ws connections opened by pages on other origins. The data is public,
 * but a stranger's page should not be able to make this server subscribe to
 * hundreds of streams.
 */
function sameOrigin(req: http.IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // Non-browser clients, e.g. scripts/smoke.ts.
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
}
