/**
 * The wire contract between the server hub and the browser.
 *
 * Prices and quantities stay as the decimal strings the exchange sends. Parsing
 * them to floats on the way through would round values like 0.1 + 0.2 before
 * anyone has decided how they should be displayed; `shared/price.ts` does that
 * exactly, at the point of display.
 */

/** `[price, quantity]`, best first. */
export type Level = [price: string, qty: string];

/** Which side took liquidity. `buy` lifted the ask, `sell` hit the bid. */
export type Aggressor = "buy" | "sell";

export type UpstreamState = "connecting" | "open" | "reconnecting" | "closed";

export interface PairInfo {
    /** Exchange symbol, uppercase, e.g. `ETHUSDT`. */
    symbol: string;
    base: string;
    quote: string;
    /** `TRADING`, or e.g. `BREAK` when halted. Only `TRADING` pairs stream. */
    status: string;
    /** Smallest price increment, e.g. `0.01000000`. */
    tickSize: string;
    /** Smallest quantity increment. */
    stepSize: string;
}

/** Rolling 24h summary for one pair. */
export interface MarketTicker {
    symbol: string;
    last: string;
    open: string;
    high: string;
    low: string;
    /** Base-asset volume. */
    volume: string;
    /** Quote-asset volume. Only comparable between pairs with the same quote asset. */
    quoteVolume: string;
}

export interface Book {
    bids: Level[];
    asks: Level[];
    updateId: number;
    /** Local receive time, epoch ms. */
    at: number;
}

export interface Quote {
    bid: string;
    bidQty: string;
    ask: string;
    askQty: string;
    at: number;
}

export interface Trade {
    id: number;
    price: string;
    qty: string;
    /** Exchange trade time, epoch ms. */
    time: number;
    side: Aggressor;
}

export interface Candle {
    /** Epoch ms of the candle's open. */
    openTime: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    /** False while the candle is still forming. */
    closed: boolean;
}

export type ClientMessage =
    | { type: "subscribe"; symbol: string }
    | { type: "unsubscribe"; symbol: string }
    | { type: "markets"; on: boolean };

export type ServerMessage =
    | { type: "hello"; exchange: string; upstream: UpstreamState }
    | { type: "status"; upstream: UpstreamState }
    | { type: "subscribed"; symbol: string }
    | { type: "book"; symbol: string; book: Book }
    | { type: "quote"; symbol: string; quote: Quote }
    | { type: "trades"; symbol: string; trades: Trade[] }
    | { type: "candle"; symbol: string; candle: Candle }
    /** `full` replaces everything the client holds; otherwise only the changed tickers. */
    | { type: "markets"; full: boolean; tickers: MarketTicker[] }
    | { type: "error"; symbol?: string; message: string };

/**
 * Validates an untrusted frame from a browser. Returns null for anything that is
 * not exactly one of the client messages, so the hub never acts on a guess.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null) return null;
    const msg = value as Record<string, unknown>;

    switch (msg.type) {
        case "subscribe":
        case "unsubscribe":
            return typeof msg.symbol === "string" && msg.symbol.length > 0 && msg.symbol.length <= 32
                ? { type: msg.type, symbol: msg.symbol }
                : null;
        case "markets":
            return typeof msg.on === "boolean" ? { type: "markets", on: msg.on } : null;
        default:
            return null;
    }
}
