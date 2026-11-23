import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStreamEvent, streamsFor } from "../server/sources/binance/index.ts";
import { toPairInfo } from "../server/sources/binance/rest.ts";
import { BinanceUpstream, decodeFrame, type MinimalSocket } from "../server/sources/binance/upstream.ts";

// Payload shapes captured from wss://stream.binance.us:9443/stream on 2026-11-23.
const SAMPLES = {
    bookTicker: { u: 3464982441, s: "BTCUSDT", b: "62712.41000000", B: "0.03991000", a: "62731.67000000", A: "0.00019000" },
    depth: {
        lastUpdateId: 3464982454,
        bids: [["62685.56000000", "0.54714000"]],
        asks: [["62731.67000000", "0.00019000"]],
    },
    trade: { e: "trade", E: 1795445643796, s: "BTCUSDT", t: 32645176, p: "62701.68000000", q: "0.00019000", T: 1795445643795, m: false, M: true },
    kline: {
        e: "kline",
        E: 1795445640262,
        s: "BTCUSDT",
        k: { t: 1795445580000, T: 1795445639999, s: "BTCUSDT", i: "1m", o: "62727.28", c: "62744.77", h: "62806.13", l: "62700.00", v: "1.5", x: false },
    },
    miniTickers: [
        { e: "24hrMiniTicker", E: 1795445635009, s: "BTCUSDT", c: "62744.77", o: "60941.75", h: "64625.98", l: "60385.78", v: "200.08", q: "12550000.1" },
    ],
};

describe("decodeFrame", () => {
    it("separates data, acks, errors and junk", () => {
        expect(decodeFrame('{"stream":"btcusdt@trade","data":{"p":"1"}}')).toEqual({ kind: "data", stream: "btcusdt@trade", data: { p: "1" } });
        expect(decodeFrame('{"result":null,"id":3}')).toEqual({ kind: "ack", id: 3 });
        expect(decodeFrame('{"error":{"code":2,"msg":"Invalid request"},"id":4}')).toEqual({ kind: "error", id: 4, message: "Invalid request" });
        expect(decodeFrame('{"code":0,"msg":"Unknown property","id":5}')).toEqual({ kind: "error", id: 5, message: "Unknown property" });
        expect(decodeFrame("{nope")).toEqual({ kind: "invalid", reason: "unparseable" });
        expect(decodeFrame("42")).toEqual({ kind: "invalid", reason: "not an object" });
    });
});

describe("parseStreamEvent", () => {
    it("maps bookTicker to a quote", () => {
        expect(parseStreamEvent("btcusdt@bookTicker", SAMPLES.bookTicker)).toMatchObject({
            kind: "quote",
            symbol: "BTCUSDT",
            quote: { bid: "62712.41000000", bidQty: "0.03991000", ask: "62731.67000000", askQty: "0.00019000" },
        });
    });

    it("takes the depth symbol from the stream name, since the payload has none", () => {
        expect(parseStreamEvent("ethusdt@depth20@100ms", SAMPLES.depth)).toMatchObject({
            kind: "book",
            symbol: "ETHUSDT",
            book: { updateId: 3464982454, bids: SAMPLES.depth.bids, asks: SAMPLES.depth.asks },
        });
    });

    it("reads the aggressor from m: buyer-maker means the seller crossed", () => {
        expect(parseStreamEvent("btcusdt@trade", SAMPLES.trade)).toMatchObject({
            kind: "trade",
            trade: { id: 32645176, price: "62701.68000000", qty: "0.00019000", time: 1795445643795, side: "buy" },
        });
        expect(parseStreamEvent("btcusdt@trade", { ...SAMPLES.trade, m: true })).toMatchObject({ trade: { side: "sell" } });
    });

    it("maps klines and mini tickers", () => {
        expect(parseStreamEvent("btcusdt@kline_1m", SAMPLES.kline)).toMatchObject({
            kind: "candle",
            candle: { openTime: 1795445580000, open: "62727.28", close: "62744.77", closed: false },
        });
        expect(parseStreamEvent("!miniTicker@arr", SAMPLES.miniTickers)).toEqual({
            kind: "tickers",
            tickers: [{ symbol: "BTCUSDT", last: "62744.77", open: "60941.75", high: "64625.98", low: "60385.78", volume: "200.08", quoteVolume: "12550000.1" }],
        });
    });

    it("returns null for what it does not understand", () => {
        expect(parseStreamEvent("btcusdt@unknown", {})).toBeNull();
        expect(parseStreamEvent("btcusdt@depth20@100ms", { bids: "x" })).toBeNull();
        expect(parseStreamEvent("btcusdt@trade", null)).toBeNull();
        expect(parseStreamEvent("nostream", {})).toBeNull();
    });

    it("streamsFor lowercases", () => {
        expect(streamsFor("ETHUSDT")).toEqual(["ethusdt@bookTicker", "ethusdt@depth20@100ms", "ethusdt@trade", "ethusdt@kline_1m"]);
    });
});

describe("toPairInfo", () => {
    it("pulls tick and step sizes from filters", () => {
        expect(
            toPairInfo({
                symbol: "ETHUSDT",
                status: "TRADING",
                baseAsset: "ETH",
                quoteAsset: "USDT",
                filters: [
                    { filterType: "PRICE_FILTER", tickSize: "0.01000000" },
                    { filterType: "LOT_SIZE", stepSize: "0.00010000" },
                ],
            }),
        ).toEqual({ symbol: "ETHUSDT", base: "ETH", quote: "USDT", status: "TRADING", tickSize: "0.01000000", stepSize: "0.00010000" });
    });
});

class FakeSocket implements MinimalSocket {
    readonly sent: { method: string; params: string[]; id: number }[] = [];
    private readonly listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    closed = false;
    terminated = false;

    on(event: string, listener: (...args: unknown[]) => void): this {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
        return this;
    }

    emit(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    send(data: string): void {
        this.sent.push(JSON.parse(data));
    }

    pong(): void {}

    close(): void {
        this.closed = true;
        this.emit("close");
    }

    terminate(): void {
        this.terminated = true;
        this.emit("close");
    }
}

describe("BinanceUpstream", () => {
    let sockets: FakeSocket[];
    let messages: [string, unknown][];
    let states: string[];

    const make = (overrides: Partial<ConstructorParameters<typeof BinanceUpstream>[0]> = {}) =>
        new BinanceUpstream({
            url: "wss://example/stream",
            onMessage: (stream, data) => messages.push([stream, data]),
            onState: (s) => states.push(s),
            createSocket: () => {
                const s = new FakeSocket();
                sockets.push(s);
                return s;
            },
            ...overrides,
        });

    const latest = () => sockets.at(-1)!;

    beforeEach(() => {
        vi.useFakeTimers();
        sockets = [];
        messages = [];
        states = [];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("sends everything wanted in one SUBSCRIBE once the socket opens", () => {
        const up = make();
        up.add(["a@trade", "b@trade"]);
        up.start();
        expect(latest().sent).toEqual([]);
        latest().emit("open");
        vi.advanceTimersByTime(0);
        expect(latest().sent).toEqual([{ method: "SUBSCRIBE", params: ["a@trade", "b@trade"], id: 1 }]);
        expect(up.subscribed()).toEqual(["a@trade", "b@trade"]);
        expect(states).toEqual(["open"]);
    });

    it("spaces control messages to stay under Binance's 5/s", () => {
        const up = make({ controlIntervalMs: 250 });
        up.start();
        latest().emit("open");
        up.add(["a@trade"]);
        vi.advanceTimersByTime(0);
        up.add(["b@trade"]);
        vi.advanceTimersByTime(249);
        expect(latest().sent).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(latest().sent.at(-1)).toMatchObject({ method: "SUBSCRIBE", params: ["b@trade"] });
    });

    it("unsubscribes, and sends nothing for an add undone before the flush", () => {
        const up = make();
        up.start();
        latest().emit("open");
        up.add(["a@trade"]);
        vi.advanceTimersByTime(0);
        up.add(["b@trade"]);
        up.remove(["b@trade", "a@trade"]);
        vi.advanceTimersByTime(1_000);
        expect(latest().sent.map((m) => m.method)).toEqual(["SUBSCRIBE", "UNSUBSCRIBE"]);
        expect(latest().sent.at(-1)?.params).toEqual(["a@trade"]);
        expect(up.subscribed()).toEqual([]);
    });

    it("reconnects with doubling backoff and resubscribes everything wanted", () => {
        const up = make({ baseDelayMs: 1_000, maxDelayMs: 4_000 });
        up.add(["a@trade"]);
        up.start();
        latest().emit("open");
        vi.advanceTimersByTime(0);

        latest().emit("close");
        expect(states.at(-1)).toBe("reconnecting");
        expect(up.subscribed()).toEqual([]);
        vi.advanceTimersByTime(999);
        expect(sockets).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(2);

        // Fails before opening, so the next wait doubles.
        latest().emit("close");
        vi.advanceTimersByTime(1_999);
        expect(sockets).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(3);

        latest().emit("open");
        vi.advanceTimersByTime(0);
        expect(latest().sent).toEqual([{ method: "SUBSCRIBE", params: ["a@trade"], id: expect.any(Number) }]);
    });

    it("stops wanting a stream Binance rejects", () => {
        const logs: string[] = [];
        const up = make({ onLog: (m) => logs.push(m) });
        up.add(["bogus@trade"]);
        up.start();
        latest().emit("open");
        vi.advanceTimersByTime(0);
        const id = latest().sent[0]!.id;
        latest().emit("message", JSON.stringify({ error: { code: 2, msg: "Invalid symbol" }, id }));
        vi.advanceTimersByTime(1_000);
        expect(up.subscribed()).toEqual([]);
        expect(latest().sent).toHaveLength(1);
        expect(logs.some((l) => l.includes("Invalid symbol"))).toBe(true);
    });

    it("forwards data frames and drops a silent connection", () => {
        make({ idleTimeoutMs: 5_000 }).start();
        latest().emit("open");
        latest().emit("message", JSON.stringify({ stream: "a@trade", data: { p: "1" } }));
        expect(messages).toEqual([["a@trade", { p: "1" }]]);
        vi.advanceTimersByTime(4_999);
        expect(latest().terminated).toBe(false);
        vi.advanceTimersByTime(1);
        expect(sockets[0]!.terminated).toBe(true);
    });

    it("recycles before the 24h cutoff", () => {
        make({ recycleAfterMs: 10_000, idleTimeoutMs: 60_000 }).start();
        latest().emit("open");
        vi.advanceTimersByTime(10_000);
        expect(sockets[0]!.closed).toBe(true);
    });

    it("close() stops reconnecting", () => {
        const up = make();
        up.start();
        latest().emit("open");
        up.close();
        vi.advanceTimersByTime(60_000);
        expect(sockets).toHaveLength(1);
        expect(up.state()).toBe("closed");
    });

    it("enforces the per-connection stream cap", () => {
        const up = make({ maxStreams: 2 });
        up.add(["a", "b", "c"]);
        up.start();
        latest().emit("open");
        vi.advanceTimersByTime(0);
        expect(latest().sent[0]?.params).toEqual(["a", "b"]);
    });
});
