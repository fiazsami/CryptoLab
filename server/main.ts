/**
 * Starts everything: the Binance.US market connection, the /ws hub, the API
 * and the viewer.
 *
 *   npm run dev      Vite middleware with hot reload; restarts on server changes
 *   npm start        builds the client, then serves it from dist/client
 *
 * PORT (default 3000) and HOST (default 127.0.0.1, which keeps it off the LAN).
 */
import { startServer } from "./app.ts";

function log(message: string): void {
    const at = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.log(`[${at}] ${message}`);
}

const production = process.env.NODE_ENV === "production";

try {
    const server = await startServer({
        port: Number(process.env.PORT ?? 3000),
        host: process.env.HOST ?? "127.0.0.1",
        frontend: production ? "static" : "vite",
        log,
    });
    log(`CryptoLab ${production ? "(production)" : "(dev)"} → ${server.url}`);

    let stopping = false;
    const stop = () => {
        if (stopping) return;
        stopping = true;
        log("shutting down");
        void server.close().then(() => process.exit(0));
        setTimeout(() => process.exit(0), 3_000).unref();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
} catch (error) {
    log(`failed to start: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
