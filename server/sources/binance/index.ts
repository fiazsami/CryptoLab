import type { Level, MarketTicker, PairInfo, UpstreamState } from "../../../shared/protocol.ts";
import { normalizeSymbol, streamSymbol } from "../../../shared/symbols.ts";
import type { MarketSource, SourceEvent, SourceListener } from "../types.ts";
import { BinanceRest } from "./rest.ts";
import { BinanceUpstream, type SocketFactory } from "./upstream.ts";

export const BINANCE_US = {
    name: "Binance.US",
    restUrl: "https://api.binance.us",
    wsUrl: "wss://stream.binance.us:9443/stream",
};

/** Always on: drives the markets page. Binance sends only the tickers that changed. */
const MARKET_STREAM = "!miniTicker@arr";

/** Everything one pair view needs. */
export function streamsFor(symbol: string): string[] {
    const s = streamSymbol(symbol);
    return [`${s}@bookTicker`, `${s}@depth20@100ms`, `${s}@trade`, `${s}@kline_1m`];
}

/**
 * Maps one upstream payload to a source event. Pure and total: anything
 * unexpected returns null rather than throwing.
 *
 * Note that the depth20 payload carries no symbol, so it is taken from the
 * stream name. The trade aggressor comes from `m` (buyer is maker): when the
 * buyer was resting, the seller crossed the spread, so the trade hit the bid.
 */
export function parseStreamEvent(stream: string, data: unknown): SourceEvent | null {
    if (typeof data !== "object" || data === null) return null;

    if (stream === MARKET_STREAM) {
        if (!Array.isArray(data)) return null;
        const tickers: MarketTicker[] = [];
        for (const t of data as Record<string, unknown>[]) {
            if (typeof t.s !== "string") continue;
            tickers.push({
                symbol: t.s,
                last: String(t.c),
                open: String(t.o),
                high: String(t.h),
                low: String(t.l),
                volume: String(t.v),
                quoteVolume: String(t.q),
            });
        }
        return { kind: "tickers", tickers };
    }

    const at = stream.indexOf("@");
    if (at <= 0) return null;
    const symbol = normalizeSymbol(stream.slice(0, at));
    const channel = stream.slice(at + 1);
    const d = data as Record<string, unknown>;

    switch (channel) {
        case "bookTicker":
            return {
                kind: "quote",
                symbol,
                quote: { bid: String(d.b), bidQty: String(d.B), ask: String(d.a), askQty: String(d.A), at: Date.now() },
            };
        case "depth20@100ms":
            if (!Array.isArray(d.bids) || !Array.isArray(d.asks)) return null;
            return {
                kind: "book",
                symbol,
                book: {
                    bids: d.bids as Level[],
                    asks: d.asks as Level[],
                    updateId: Number(d.lastUpdateId),
                    at: Date.now(),
                },
            };
        case "trade":
            return {
                kind: "trade",
                symbol,
                trade: {
                    id: Number(d.t),
                    price: String(d.p),
                    qty: String(d.q),
                    time: Number(d.T),
                    side: d.m === true ? "sell" : "buy",
                },
            };
        case "kline_1m": {
            const k = d.k as Record<string, unknown> | undefined;
            if (!k) return null;
            return {
                kind: "candle",
                symbol,
                candle: {
                    openTime: Number(k.t),
                    open: String(k.o),
                    high: String(k.h),
                    low: String(k.l),
                    close: String(k.c),
                    volume: String(k.v),
                    closed: k.x === true,
                },
            };
        }
        default:
            return null;
    }
}

export interface BinanceSourceOptions {
    name?: string;
    restUrl?: string;
    wsUrl?: string;
    /** How often to refresh the pair list and the full ticker snapshot. */
    refreshMs?: number;
    onLog?: (message: string) => void;
    createSocket?: SocketFactory;
    fetchFn?: typeof fetch;
}

export class BinanceSource implements MarketSource {
    readonly name: string;

    private readonly rest: BinanceRest;
    private readonly upstream: BinanceUpstream;
    private readonly listeners: SourceListener[] = [];
    private readonly log: (message: string) => void;
    private readonly refreshMs: number;

    private pairList: PairInfo[] = [];
    private pairIndex = new Map<string, PairInfo>();
    private readonly tickerIndex = new Map<string, MarketTicker>();
    private readonly watched = new Set<string>();
    private refreshTimer: NodeJS.Timeout | null = null;

    constructor(options: BinanceSourceOptions = {}) {
        this.name = options.name ?? BINANCE_US.name;
        this.log = options.onLog ?? (() => {});
        this.refreshMs = options.refreshMs ?? 60 * 60 * 1000;
        this.rest = new BinanceRest(options.restUrl ?? BINANCE_US.restUrl, options.fetchFn);
        this.upstream = new BinanceUpstream({
            url: options.wsUrl ?? BINANCE_US.wsUrl,
            onMessage: (stream, data) => this.receive(stream, data),
            onState: (state) => this.emit({ kind: "state", state }),
            onLog: this.log,
            ...(options.createSocket ? { createSocket: options.createSocket } : {}),
        });
    }

    async start(): Promise<void> {
        // The pair list is what makes a typed symbol valid, so it is required to start.
        // A ticker failure only leaves the markets page sparse until the stream fills it.
        const [pairs, tickers] = await Promise.allSettled([this.rest.pairs(), this.rest.tickers()]);
        if (pairs.status === "rejected") {
            throw new Error(`could not load the ${this.name} pair list: ${errorMessage(pairs.reason)}`);
        }
        this.setPairs(pairs.value);
        if (tickers.status === "fulfilled") this.setTickers(tickers.value);
        else this.log(`ticker snapshot failed: ${errorMessage(tickers.reason)}`);

        this.upstream.add([MARKET_STREAM]);
        this.upstream.start();

        this.refreshTimer = setInterval(() => void this.refresh(), this.refreshMs);
        this.refreshTimer.unref();
    }

    close(): void {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = null;
        this.upstream.close();
    }

    listen(listener: SourceListener): void {
        this.listeners.push(listener);
    }

    pairs(): PairInfo[] {
        return this.pairList;
    }

    pair(symbol: string): PairInfo | undefined {
        return this.pairIndex.get(normalizeSymbol(symbol));
    }

    tickers(): MarketTicker[] {
        return [...this.tickerIndex.values()];
    }

    candles(symbol: string, interval: string, limit: number) {
        return this.rest.klines(normalizeSymbol(symbol), interval, limit);
    }

    watch(symbol: string): void {
        const s = normalizeSymbol(symbol);
        if (this.watched.has(s)) return;
        this.watched.add(s);
        this.upstream.add(streamsFor(s));
    }

    unwatch(symbol: string): void {
        const s = normalizeSymbol(symbol);
        if (!this.watched.delete(s)) return;
        this.upstream.remove(streamsFor(s));
    }

    state(): UpstreamState {
        return this.upstream.state();
    }

    streams(): string[] {
        return this.upstream.subscribed();
    }

    private async refresh(): Promise<void> {
        try {
            this.setPairs(await this.rest.pairs());
            const tickers = await this.rest.tickers();
            this.setTickers(tickers);
            this.emit({ kind: "tickers", tickers });
        } catch (error) {
            this.log(`hourly refresh failed, keeping the previous lists: ${errorMessage(error)}`);
        }
    }

    private setPairs(pairs: PairInfo[]): void {
        this.pairList = [...pairs].sort((a, b) => a.symbol.localeCompare(b.symbol));
        this.pairIndex = new Map(this.pairList.map((p) => [p.symbol, p]));
    }

    private setTickers(tickers: MarketTicker[]): void {
        for (const t of tickers) this.tickerIndex.set(t.symbol, t);
    }

    private receive(stream: string, data: unknown): void {
        const event = parseStreamEvent(stream, data);
        if (!event) return;
        if (event.kind === "tickers") this.setTickers(event.tickers);
        this.emit(event);
    }

    private emit(event: SourceEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
