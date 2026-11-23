import { describe, expect, it } from "vitest";
import type { Book, PairInfo, Trade } from "../shared/protocol.ts";
import { parseClientMessage } from "../shared/protocol.ts";
import { normalizeSymbol } from "../shared/symbols.ts";
import { groupSide, pairDepth } from "../web/src/lib/book.ts";
import { FlowBook } from "../web/src/lib/flow.ts";
import { parseRoute } from "../web/src/lib/routes.ts";
import { rankPairs } from "../web/src/lib/search.ts";

function pair(base: string, quote: string, status = "TRADING"): PairInfo {
    return { symbol: base + quote, base, quote, status, tickSize: "0.01000000", stepSize: "0.00010000" };
}

describe("normalizeSymbol", () => {
    it.each(["eth/usdt", "ETH-USDT", "eth usdt", "ethusdt", " EthUsdt "])("%s → ETHUSDT", (input) => {
        expect(normalizeSymbol(input)).toBe("ETHUSDT");
    });
});

describe("parseClientMessage", () => {
    it("accepts the three message shapes", () => {
        expect(parseClientMessage('{"type":"subscribe","symbol":"ETHUSDT"}')).toEqual({ type: "subscribe", symbol: "ETHUSDT" });
        expect(parseClientMessage('{"type":"unsubscribe","symbol":"x"}')).toEqual({ type: "unsubscribe", symbol: "x" });
        expect(parseClientMessage('{"type":"markets","on":true}')).toEqual({ type: "markets", on: true });
    });

    it.each([
        "not json",
        "null",
        "[]",
        '{"type":"subscribe"}',
        '{"type":"subscribe","symbol":""}',
        `{"type":"subscribe","symbol":"${"A".repeat(33)}"}`,
        '{"type":"markets","on":"yes"}',
        '{"type":"drop-tables"}',
    ])("rejects %s", (raw) => {
        expect(parseClientMessage(raw)).toBeNull();
    });
});

describe("parseRoute", () => {
    it("routes markets, pairs and everything else", () => {
        expect(parseRoute("/")).toEqual({ name: "markets" });
        expect(parseRoute("/pair/eth-usdt")).toEqual({ name: "pair", symbol: "ETHUSDT" });
        expect(parseRoute("/pair/BTC%2FUSD/")).toEqual({ name: "pair", symbol: "BTCUSD" });
        expect(parseRoute("/pair/%E0%A4%A")).toEqual({ name: "missing", path: "/pair/%E0%A4%A" });
        expect(parseRoute("/nope")).toEqual({ name: "missing", path: "/nope" });
    });
});

describe("rankPairs", () => {
    const list = [
        pair("ETH", "BTC"),
        pair("ETH", "USDT"),
        pair("ETH", "USD"),
        pair("ETHFI", "USDT"),
        pair("SETH", "USD"),
        pair("ETH", "DAI", "BREAK"),
        pair("BTC", "USD"),
    ];
    const symbols = (q: string) => rankPairs(list, q).map((p) => p.symbol);

    it("puts the exact symbol first", () => {
        expect(symbols("ethusdt")[0]).toBe("ETHUSDT");
    });

    it("ranks exact base by quote preference, halted last within the base", () => {
        expect(symbols("eth").slice(0, 4)).toEqual(["ETHUSD", "ETHUSDT", "ETHBTC", "ETHDAI"]);
    });

    it("then prefixes, then substrings", () => {
        expect(symbols("eth")).toEqual(["ETHUSD", "ETHUSDT", "ETHBTC", "ETHDAI", "ETHFIUSDT", "SETHUSD"]);
    });

    it("splits base/quote on a separator", () => {
        expect(symbols("eth/us")).toEqual(["ETHUSD", "ETHUSDT"]);
        expect(symbols("eth/usdt")).toEqual(["ETHUSDT"]);
    });

    it("returns nothing for an empty query", () => {
        expect(symbols("  ")).toEqual([]);
    });
});

describe("order book grouping", () => {
    const book: Book = {
        bids: [
            ["100.07", "1"],
            ["100.03", "2"],
            ["99.98", "4"],
        ],
        asks: [
            ["100.11", "1"],
            ["100.19", "3"],
            ["100.21", "5"],
        ],
        updateId: 1,
        at: 0,
    };

    it("merges adjacent levels that land in one bucket", () => {
        expect(groupSide(book.bids, 1, "floor").map((l) => [l.price, l.qty])).toEqual([
            ["100.0", 3],
            ["99.9", 4],
        ]);
        expect(groupSide(book.asks, 1, "ceil").map((l) => [l.price, l.qty])).toEqual([
            ["100.2", 4],
            ["100.3", 5],
        ]);
    });

    it("pairs the i-th bid with the i-th ask, with a spread only when both exist", () => {
        const rows = pairDepth(book, 1, 20);
        expect(rows.map((r) => [r.bid?.price, r.spread, r.ask?.price])).toEqual([
            ["100.0", "0.2", "100.2"],
            ["99.9", "0.4", "100.3"],
        ]);
    });

    it("keeps a thin book's rows rather than requiring 20", () => {
        const thin: Book = { bids: [["1.00", "1"]], asks: [], updateId: 1, at: 0 };
        const rows = pairDepth(thin, 2, 20);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.spread).toBeNull();
    });
});

describe("FlowBook", () => {
    let id = 0;
    const trade = (price: string, qty: string, side: "buy" | "sell"): Trade => ({ id: ++id, price, qty, time: 0, side });

    it("groups buys up and sells down for the book's traded columns", () => {
        const flow = new FlowBook();
        flow.add(trade("100.05", "1", "buy"));
        flow.add(trade("100.05", "2", "sell"));
        const { buys, sells } = flow.grouped(1);
        expect([...buys.values()]).toEqual([1]);
        expect([...sells.values()]).toEqual([2]);
        expect([...buys.keys()][0]).not.toBe([...sells.keys()][0]);
    });

    it("lays out a ladder around the last trade, highest first", () => {
        const flow = new FlowBook();
        flow.add(trade("100.04", "1", "buy"));
        flow.add(trade("100.06", "2", "sell"));
        flow.add(trade("100.12", "3", "buy"));
        const rows = flow.ladder(1, 4);
        expect(rows.map((r) => r.price)).toEqual(["100.2", "100.1", "100.0", "99.9"]);
        expect(rows.find((r) => r.isLast)?.price).toBe("100.1");
        expect(rows.find((r) => r.price === "100.0")).toMatchObject({ buy: 1, sell: 2 });
        expect(rows.find((r) => r.price === "100.1")).toMatchObject({ buy: 3, sell: 0 });
    });

    it("regroups history when precision changes", () => {
        const flow = new FlowBook();
        flow.add(trade("100.04", "1", "buy"));
        flow.add(trade("100.06", "2", "buy"));
        expect(flow.ladder(2, 2).reduce((n, r) => n + r.buy, 0)).toBe(2);
        expect(flow.ladder(0, 2).find((r) => r.isLast)?.buy).toBe(3);
    });

    it("reset clears volume but keeps the last price", () => {
        const flow = new FlowBook();
        flow.add(trade("5.00", "1", "sell"));
        flow.reset();
        expect(flow.ladder(2, 2).every((r) => r.buy === 0 && r.sell === 0)).toBe(true);
        expect(flow.lastUnits()).not.toBeNull();
    });
});
