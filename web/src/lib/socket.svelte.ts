import type { ClientMessage, ServerMessage, UpstreamState } from "../../../shared/protocol.ts";

type Handler = (message: ServerMessage) => void;

/**
 * The page's single connection to the server hub.
 *
 * Components subscribe with a handler and get back an unsubscribe function, so
 * an `$effect` can return it and cleanup is automatic. The server is told about
 * a symbol once, however many components on the page watch it. After a
 * reconnect, every live subscription is sent again.
 */
class MarketSocket {
    connected = $state(false);
    upstream = $state<UpstreamState>("connecting");
    exchange = $state("Binance.US");

    private ws: WebSocket | null = null;
    private started = false;
    private suspended = false;
    private attempt = 0;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly symbolHandlers = new Map<string, Set<Handler>>();
    private readonly marketHandlers = new Set<Handler>();

    subscribe(symbol: string, handler: Handler): () => void {
        this.start();
        let set = this.symbolHandlers.get(symbol);
        if (!set) {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity -- handler registry, not UI state
            set = new Set();
            this.symbolHandlers.set(symbol, set);
            this.send({ type: "subscribe", symbol });
        }
        set.add(handler);

        return () => {
            const current = this.symbolHandlers.get(symbol);
            if (!current) return;
            current.delete(handler);
            if (current.size === 0) {
                this.symbolHandlers.delete(symbol);
                this.send({ type: "unsubscribe", symbol });
            }
        };
    }

    markets(handler: Handler): () => void {
        this.start();
        if (this.marketHandlers.size === 0) this.send({ type: "markets", on: true });
        this.marketHandlers.add(handler);

        return () => {
            this.marketHandlers.delete(handler);
            if (this.marketHandlers.size === 0) this.send({ type: "markets", on: false });
        };
    }

    private start(): void {
        if (this.started) return;
        this.started = true;

        // Chrome can keep a page we navigated away from in the back/forward
        // cache with its WebSocket still open. The server then keeps streaming
        // that page's pairs to a tab nobody is looking at. Close the socket
        // while the page is cached, and reconnect if it is restored.
        window.addEventListener("pagehide", (event) => {
            if (!event.persisted) return;
            this.suspended = true;
            if (this.retryTimer !== null) clearTimeout(this.retryTimer);
            this.retryTimer = null;
            this.ws?.close();
        });
        window.addEventListener("pageshow", (event) => {
            if (!event.persisted || !this.suspended) return;
            this.suspended = false;
            this.attempt = 0;
            this.connect();
        });

        this.connect();
    }

    private connect(): void {
        this.retryTimer = null;
        const protocol = location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(`${protocol}://${location.host}/ws`);
        this.ws = ws;

        ws.onopen = () => {
            this.connected = true;
            this.attempt = 0;
            for (const symbol of this.symbolHandlers.keys()) this.send({ type: "subscribe", symbol });
            if (this.marketHandlers.size > 0) this.send({ type: "markets", on: true });
        };

        ws.onmessage = (event: MessageEvent<string>) => {
            let message: ServerMessage;
            try {
                message = JSON.parse(event.data) as ServerMessage;
            } catch {
                return;
            }
            this.dispatch(message);
        };

        ws.onclose = () => {
            if (this.ws !== ws) return;
            this.connected = false;
            this.ws = null;
            if (this.suspended) return;
            const delay = Math.min(500 * 2 ** this.attempt, 10_000);
            this.attempt += 1;
            this.retryTimer = setTimeout(() => this.connect(), delay);
        };
    }

    private dispatch(message: ServerMessage): void {
        switch (message.type) {
            case "hello":
                this.exchange = message.exchange;
                this.upstream = message.upstream;
                return;
            case "status":
                this.upstream = message.upstream;
                return;
            case "markets":
                for (const handler of this.marketHandlers) handler(message);
                return;
            case "error":
                if (!message.symbol) {
                    console.warn(`[cryptolab] server: ${message.message}`);
                    return;
                }
                break;
            default:
                break;
        }
        if ("symbol" in message && message.symbol) {
            for (const handler of this.symbolHandlers.get(message.symbol) ?? []) handler(message);
        }
    }

    private send(message: ClientMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
    }
}

export const socket = new MarketSocket();
