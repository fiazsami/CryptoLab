import {
    parseClientMessage,
    type Book,
    type Candle,
    type MarketTicker,
    type Quote,
    type ServerMessage,
    type Trade,
} from "../shared/protocol.ts";
import { normalizeSymbol } from "../shared/symbols.ts";
import type { MarketSource, SourceEvent } from "./sources/types.ts";

/**
 * Fans one upstream connection out to every browser tab.
 *
 * A symbol is watched upstream while at least one tab wants it. When the last
 * tab leaves, the symbol is kept for a grace period, so navigating away and
 * back (or reloading) does not churn Binance subscriptions or lose the cached
 * snapshot a new tab is shown first.
 */

/** The slice of a `ws` server-side socket the hub uses. */
export interface ClientSocket {
    readonly readyState: number;
    readonly bufferedAmount: number;
    send(data: string): void;
    on(event: "message", listener: (data: unknown) => void): unknown;
    on(event: "close", listener: () => void): unknown;
}

const OPEN = 1;

export interface HubOptions {
    /** Keep a symbol upstream this long after its last viewer leaves. */
    graceMs?: number;
    /** Trades are batched per symbol and sent at most this often. */
    tradeFlushMs?: number;
    /** Changed market tickers are sent at most this often. */
    marketsFlushMs?: number;
    /** Book frames are skipped for a client whose send buffer exceeds this. */
    maxBufferedBytes?: number;
    /** Recent trades replayed to a newly subscribed tab. */
    recentTrades?: number;
    onLog?: (message: string) => void;
}

interface Cached {
    book?: Book;
    quote?: Quote;
    candle?: Candle;
    trades: Trade[];
}

interface Client {
    symbols: Set<string>;
    markets: boolean;
}

export interface HubHealth {
    exchange: string;
    upstream: string;
    clients: number;
    symbols: { symbol: string; viewers: number }[];
    lingering: string[];
    streams: string[];
}

export class Hub {
    private readonly source: MarketSource;
    private readonly graceMs: number;
    private readonly maxBuffered: number;
    private readonly recentTrades: number;
    private readonly log: (message: string) => void;

    private readonly clients = new Map<ClientSocket, Client>();
    private readonly viewers = new Map<string, Set<ClientSocket>>();
    private readonly grace = new Map<string, NodeJS.Timeout>();
    private readonly cache = new Map<string, Cached>();
    private readonly pendingTrades = new Map<string, Trade[]>();
    private readonly changedTickers = new Map<string, MarketTicker>();
    private readonly timers: NodeJS.Timeout[] = [];

    constructor(source: MarketSource, options: HubOptions = {}) {
        this.source = source;
        this.graceMs = options.graceMs ?? 30_000;
        this.maxBuffered = options.maxBufferedBytes ?? 1_000_000;
        this.recentTrades = options.recentTrades ?? 100;
        this.log = options.onLog ?? (() => {});

        source.listen((event) => this.onSource(event));
        this.timers.push(setInterval(() => this.flushTrades(), options.tradeFlushMs ?? 100));
        this.timers.push(setInterval(() => this.flushMarkets(), options.marketsFlushMs ?? 1_000));
    }

    attach(socket: ClientSocket): void {
        this.clients.set(socket, { symbols: new Set(), markets: false });
        socket.on("message", (data) => this.onClient(socket, String(data)));
        socket.on("close", () => this.detach(socket));
        this.send(socket, { type: "hello", exchange: this.source.name, upstream: this.source.state() });
    }

    health(): HubHealth {
        return {
            exchange: this.source.name,
            upstream: this.source.state(),
            clients: this.clients.size,
            symbols: [...this.viewers].map(([symbol, set]) => ({ symbol, viewers: set.size })),
            lingering: [...this.grace.keys()],
            streams: this.source.streams(),
        };
    }

    close(): void {
        for (const timer of this.timers) clearInterval(timer);
        for (const timer of this.grace.values()) clearTimeout(timer);
        this.grace.clear();
    }

    private detach(socket: ClientSocket): void {
        const client = this.clients.get(socket);
        if (!client) return;
        for (const symbol of client.symbols) this.leave(socket, symbol);
        this.clients.delete(socket);
    }

    private onClient(socket: ClientSocket, raw: string): void {
        const client = this.clients.get(socket);
        if (!client) return;
        const msg = parseClientMessage(raw);
        if (!msg) {
            this.send(socket, { type: "error", message: "unrecognised message" });
            return;
        }

        switch (msg.type) {
            case "subscribe":
                this.join(socket, client, msg.symbol);
                return;
            case "unsubscribe": {
                const symbol = normalizeSymbol(msg.symbol);
                if (client.symbols.delete(symbol)) this.leave(socket, symbol);
                return;
            }
            case "markets":
                client.markets = msg.on;
                if (msg.on) this.send(socket, { type: "markets", full: true, tickers: this.source.tickers() });
                return;
        }
    }

    private join(socket: ClientSocket, client: Client, requested: string): void {
        const symbol = normalizeSymbol(requested);
        const pair = this.source.pair(symbol);
        if (!pair) {
            this.send(socket, { type: "error", symbol, message: `${symbol} is not listed on ${this.source.name}` });
            return;
        }
        if (pair.status !== "TRADING") {
            this.send(socket, {
                type: "error",
                symbol,
                message: `${symbol} is not trading on ${this.source.name} (status ${pair.status})`,
            });
            return;
        }
        if (client.symbols.has(symbol)) return;

        client.symbols.add(symbol);
        let set = this.viewers.get(symbol);
        if (!set) {
            set = new Set();
            this.viewers.set(symbol, set);
        }
        set.add(socket);

        const lingering = this.grace.get(symbol);
        if (lingering) {
            clearTimeout(lingering);
            this.grace.delete(symbol);
        } else if (set.size === 1) {
            this.cache.set(symbol, { trades: [] });
            this.source.watch(symbol);
            this.log(`watching ${symbol}`);
        }

        this.send(socket, { type: "subscribed", symbol });
        const cached = this.cache.get(symbol);
        if (cached?.quote) this.send(socket, { type: "quote", symbol, quote: cached.quote });
        if (cached?.book) this.send(socket, { type: "book", symbol, book: cached.book });
        if (cached?.candle) this.send(socket, { type: "candle", symbol, candle: cached.candle });
        if (cached && cached.trades.length > 0) this.send(socket, { type: "trades", symbol, trades: cached.trades });
    }

    private leave(socket: ClientSocket, symbol: string): void {
        const set = this.viewers.get(symbol);
        if (!set) return;
        set.delete(socket);
        if (set.size > 0) return;

        this.viewers.delete(symbol);
        this.grace.set(
            symbol,
            setTimeout(() => {
                this.grace.delete(symbol);
                if (this.viewers.has(symbol)) return;
                this.source.unwatch(symbol);
                this.cache.delete(symbol);
                this.pendingTrades.delete(symbol);
                this.log(`stopped watching ${symbol}`);
            }, this.graceMs),
        );
    }

    private onSource(event: SourceEvent): void {
        switch (event.kind) {
            case "state":
                this.broadcastAll({ type: "status", upstream: event.state });
                return;
            case "tickers":
                for (const t of event.tickers) this.changedTickers.set(t.symbol, t);
                return;
            case "trade": {
                const cached = this.cache.get(event.symbol);
                if (!cached) return;
                cached.trades.push(event.trade);
                if (cached.trades.length > this.recentTrades) cached.trades.splice(0, cached.trades.length - this.recentTrades);
                const pending = this.pendingTrades.get(event.symbol);
                if (pending) pending.push(event.trade);
                else this.pendingTrades.set(event.symbol, [event.trade]);
                return;
            }
            case "book": {
                const cached = this.cache.get(event.symbol);
                if (!cached) return;
                cached.book = event.book;
                this.toViewers(event.symbol, { type: "book", symbol: event.symbol, book: event.book }, true);
                return;
            }
            case "quote": {
                const cached = this.cache.get(event.symbol);
                if (!cached) return;
                cached.quote = event.quote;
                this.toViewers(event.symbol, { type: "quote", symbol: event.symbol, quote: event.quote }, false);
                return;
            }
            case "candle": {
                const cached = this.cache.get(event.symbol);
                if (!cached) return;
                cached.candle = event.candle;
                this.toViewers(event.symbol, { type: "candle", symbol: event.symbol, candle: event.candle }, false);
                return;
            }
        }
    }

    private flushTrades(): void {
        for (const [symbol, trades] of this.pendingTrades) {
            this.toViewers(symbol, { type: "trades", symbol, trades }, false);
        }
        this.pendingTrades.clear();
    }

    private flushMarkets(): void {
        if (this.changedTickers.size === 0) return;
        const payload = JSON.stringify({ type: "markets", full: false, tickers: [...this.changedTickers.values()] } satisfies ServerMessage);
        this.changedTickers.clear();
        for (const [socket, client] of this.clients) {
            if (client.markets) this.sendRaw(socket, payload, true);
        }
    }

    /** Serialises once per event, however many tabs are watching. */
    private toViewers(symbol: string, message: ServerMessage, droppable: boolean): void {
        const set = this.viewers.get(symbol);
        if (!set || set.size === 0) return;
        const payload = JSON.stringify(message);
        for (const socket of set) this.sendRaw(socket, payload, droppable);
    }

    private broadcastAll(message: ServerMessage): void {
        const payload = JSON.stringify(message);
        for (const socket of this.clients.keys()) this.sendRaw(socket, payload, false);
    }

    private send(socket: ClientSocket, message: ServerMessage): void {
        this.sendRaw(socket, JSON.stringify(message), false);
    }

    /**
     * Books and market deltas are snapshots or self-healing, so a slow client can
     * skip some. Trades, quotes and candles are always queued: a skipped trade would
     * make that tab's imbalance totals wrong.
     */
    private sendRaw(socket: ClientSocket, payload: string, droppable: boolean): void {
        if (socket.readyState !== OPEN) return;
        if (droppable && socket.bufferedAmount > this.maxBuffered) return;
        socket.send(payload);
    }
}
