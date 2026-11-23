import type { Book, Candle, MarketTicker, PairInfo, Quote, Trade, UpstreamState } from "../../shared/protocol.ts";

/**
 * What the hub needs from an exchange. Binance.US is the only implementation;
 * the seam exists so a second exchange is one new adapter, not a hub rewrite.
 */
export type SourceEvent =
    | { kind: "book"; symbol: string; book: Book }
    | { kind: "quote"; symbol: string; quote: Quote }
    | { kind: "trade"; symbol: string; trade: Trade }
    | { kind: "candle"; symbol: string; candle: Candle }
    /** Tickers that changed since the last event, not the whole market. */
    | { kind: "tickers"; tickers: MarketTicker[] }
    | { kind: "state"; state: UpstreamState };

export type SourceListener = (event: SourceEvent) => void;

export interface MarketSource {
    /** Human name, e.g. "Binance.US". */
    readonly name: string;

    /** Loads the pair list and opens the market connection. Rejects if the pair list is unreachable. */
    start(): Promise<void>;
    close(): void;

    listen(listener: SourceListener): void;

    pairs(): PairInfo[];
    pair(symbol: string): PairInfo | undefined;
    /** Every ticker currently known. */
    tickers(): MarketTicker[];
    candles(symbol: string, interval: string, limit: number): Promise<Candle[]>;

    /** Starts streaming book, quote, trades and candles for a symbol. Idempotent. */
    watch(symbol: string): void;
    unwatch(symbol: string): void;

    state(): UpstreamState;
    /** Upstream stream names currently subscribed, for /api/health. */
    streams(): string[];
}
