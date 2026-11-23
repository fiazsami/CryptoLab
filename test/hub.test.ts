import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hub, type ClientSocket } from "../server/hub.ts";
import type { MarketSource, SourceEvent, SourceListener } from "../server/sources/types.ts";
import type { ClientMessage, MarketTicker, PairInfo, ServerMessage, Trade } from "../shared/protocol.ts";

class FakeSource implements MarketSource {
    readonly name = "Fake";
    readonly watched: string[] = [];
    readonly unwatched: string[] = [];
    private readonly listeners: SourceListener[] = [];
    private readonly list: PairInfo[] = [
        { symbol: "ETHUSDT", base: "ETH", quote: "USDT", status: "TRADING", tickSize: "0.01", stepSize: "0.0001" },
        { symbol: "BTCUSD", base: "BTC", quote: "USD", status: "TRADING", tickSize: "0.01", stepSize: "0.0001" },
        { symbol: "OLDUSD", base: "OLD", quote: "USD", status: "BREAK", tickSize: "0.01", stepSize: "0.01" },
    ];
    tickerList: MarketTicker[] = [];

    async start() {}
    close() {}
    listen(listener: SourceListener) {
        this.listeners.push(listener);
    }
    pairs() {
        return this.list;
    }
    pair(symbol: string) {
        return this.list.find((p) => p.symbol === symbol.toUpperCase());
    }
    tickers() {
        return this.tickerList;
    }
    async candles() {
        return [];
    }
    watch(symbol: string) {
        this.watched.push(symbol);
    }
    unwatch(symbol: string) {
        this.unwatched.push(symbol);
    }
    state() {
        return "open" as const;
    }
    streams() {
        return [];
    }
    emit(event: SourceEvent) {
        for (const l of this.listeners) l(event);
    }
}

class FakeClient implements ClientSocket {
    readyState = 1;
    bufferedAmount = 0;
    readonly received: ServerMessage[] = [];
    private onMessage: ((data: unknown) => void) | undefined;
    private onClose: (() => void) | undefined;

    send(data: string) {
        this.received.push(JSON.parse(data) as ServerMessage);
    }
    on(event: "message" | "close", listener: (data?: unknown) => void) {
        if (event === "message") this.onMessage = listener;
        else this.onClose = listener as () => void;
        return this;
    }
    say(message: ClientMessage | string) {
        this.onMessage?.(typeof message === "string" ? message : JSON.stringify(message));
    }
    disconnect() {
        this.readyState = 3;
        this.onClose?.();
    }
    types() {
        return this.received.map((m) => m.type);
    }
    last() {
        return this.received.at(-1);
    }
}

const book = { bids: [["1.00", "1"]] as [string, string][], asks: [["1.01", "1"]] as [string, string][], updateId: 1, at: 0 };
const trade = (id: number): Trade => ({ id, price: "1.00", qty: "1", time: id, side: "buy" });

describe("Hub", () => {
    let source: FakeSource;
    let hub: Hub;

    const connect = () => {
        const c = new FakeClient();
        hub.attach(c);
        return c;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        source = new FakeSource();
        hub = new Hub(source, { graceMs: 30_000, tradeFlushMs: 100, marketsFlushMs: 1_000, maxBufferedBytes: 1_000 });
    });

    afterEach(() => {
        hub.close();
        vi.useRealTimers();
    });

    it("greets a new client with the exchange and upstream state", () => {
        expect(connect().received[0]).toEqual({ type: "hello", exchange: "Fake", upstream: "open" });
    });

    it("refuses unknown and halted pairs without watching them", () => {
        const c = connect();
        c.say({ type: "subscribe", symbol: "NOPEUSD" });
        expect(c.last()).toEqual({ type: "error", symbol: "NOPEUSD", message: "NOPEUSD is not listed on Fake" });
        c.say({ type: "subscribe", symbol: "OLDUSD" });
        expect(c.last()).toMatchObject({ type: "error", symbol: "OLDUSD" });
        expect(source.watched).toEqual([]);
    });

    it("rejects malformed messages", () => {
        const c = connect();
        c.say("{garbage");
        expect(c.last()).toEqual({ type: "error", message: "unrecognised message" });
    });

    it("watches a symbol once for many viewers and normalises what was typed", () => {
        const a = connect();
        const b = connect();
        a.say({ type: "subscribe", symbol: "eth-usdt" });
        b.say({ type: "subscribe", symbol: "ETHUSDT" });
        a.say({ type: "subscribe", symbol: "ETHUSDT" });
        expect(source.watched).toEqual(["ETHUSDT"]);
        expect(a.last()).toEqual({ type: "subscribed", symbol: "ETHUSDT" });
        expect(hub.health().symbols).toEqual([{ symbol: "ETHUSDT", viewers: 2 }]);
    });

    it("sends a symbol's events only to its viewers", () => {
        const viewer = connect();
        const other = connect();
        viewer.say({ type: "subscribe", symbol: "ETHUSDT" });
        other.say({ type: "subscribe", symbol: "BTCUSD" });
        source.emit({ kind: "book", symbol: "ETHUSDT", book });
        expect(viewer.last()).toEqual({ type: "book", symbol: "ETHUSDT", book });
        expect(other.types()).not.toContain("book");
    });

    it("keeps a symbol through the grace period, then unwatches it", () => {
        const c = connect();
        c.say({ type: "subscribe", symbol: "ETHUSDT" });
        c.disconnect();
        vi.advanceTimersByTime(29_999);
        expect(source.unwatched).toEqual([]);
        expect(hub.health().lingering).toEqual(["ETHUSDT"]);
        vi.advanceTimersByTime(1);
        expect(source.unwatched).toEqual(["ETHUSDT"]);
        expect(hub.health().lingering).toEqual([]);
    });

    it("a viewer returning within the grace period cancels the unwatch and gets the cached snapshot", () => {
        const first = connect();
        first.say({ type: "subscribe", symbol: "ETHUSDT" });
        source.emit({ kind: "book", symbol: "ETHUSDT", book });
        source.emit({ kind: "trade", symbol: "ETHUSDT", trade: trade(1) });
        first.say({ type: "unsubscribe", symbol: "ETHUSDT" });
        vi.advanceTimersByTime(10_000);

        const second = connect();
        second.say({ type: "subscribe", symbol: "ETHUSDT" });
        vi.advanceTimersByTime(60_000);
        expect(source.watched).toEqual(["ETHUSDT"]);
        expect(source.unwatched).toEqual([]);
        expect(second.types()).toEqual(["hello", "subscribed", "book", "trades"]);
    });

    it("batches trades per flush interval", () => {
        const c = connect();
        c.say({ type: "subscribe", symbol: "ETHUSDT" });
        for (const id of [1, 2, 3]) source.emit({ kind: "trade", symbol: "ETHUSDT", trade: trade(id) });
        expect(c.types()).not.toContain("trades");
        vi.advanceTimersByTime(100);
        const batches = c.received.filter((m) => m.type === "trades");
        expect(batches).toHaveLength(1);
        expect(batches[0]).toMatchObject({ trades: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    });

    it("skips book frames for a backed-up client but still delivers trades", () => {
        const c = connect();
        c.say({ type: "subscribe", symbol: "ETHUSDT" });
        c.bufferedAmount = 5_000;
        source.emit({ kind: "book", symbol: "ETHUSDT", book });
        source.emit({ kind: "trade", symbol: "ETHUSDT", trade: trade(1) });
        vi.advanceTimersByTime(100);
        expect(c.types()).not.toContain("book");
        expect(c.types()).toContain("trades");
    });

    it("sends the market snapshot on request, then only deltas, only to market listeners", () => {
        source.tickerList = [{ symbol: "ETHUSDT", last: "1", open: "1", high: "1", low: "1", volume: "1", quoteVolume: "1" }];
        const listener = connect();
        const bystander = connect();
        listener.say({ type: "markets", on: true });
        expect(listener.last()).toMatchObject({ type: "markets", full: true, tickers: [{ symbol: "ETHUSDT" }] });

        const changed = { ...source.tickerList[0]!, last: "2" };
        source.emit({ kind: "tickers", tickers: [changed] });
        source.emit({ kind: "tickers", tickers: [{ ...changed, last: "3" }] });
        vi.advanceTimersByTime(1_000);
        expect(listener.last()).toEqual({ type: "markets", full: false, tickers: [{ ...changed, last: "3" }] });
        expect(bystander.types()).toEqual(["hello"]);

        listener.say({ type: "markets", on: false });
        source.emit({ kind: "tickers", tickers: [changed] });
        vi.advanceTimersByTime(1_000);
        expect(listener.received.filter((m) => m.type === "markets")).toHaveLength(2);
    });

    it("broadcasts upstream state changes to everyone", () => {
        const a = connect();
        const b = connect();
        source.emit({ kind: "state", state: "reconnecting" });
        expect(a.last()).toEqual({ type: "status", upstream: "reconnecting" });
        expect(b.last()).toEqual({ type: "status", upstream: "reconnecting" });
    });
});
