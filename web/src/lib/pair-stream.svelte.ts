import type { Book, Candle, MarketTicker, Quote, ServerMessage, Trade } from "../../../shared/protocol.ts";
import { FlowBook } from "./flow.ts";
import { socket } from "./socket.svelte.ts";

const TAPE_LENGTH = 200;

/**
 * Everything live about one pair, shared by the panels of a pair view.
 * Create one per view, and call `close()` when the view goes away.
 */
export class PairStream {
    readonly symbol: string;
    readonly flow = new FlowBook();

    book = $state.raw<Book | null>(null);
    quote = $state.raw<Quote | null>(null);
    candle = $state.raw<Candle | null>(null);
    ticker = $state.raw<MarketTicker | null>(null);
    /** Newest first. */
    trades = $state.raw<Trade[]>([]);
    error = $state<string | null>(null);
    /** Local time of the last book or quote, for the staleness badge. */
    lastAt = $state(0);
    /** Bumped whenever `flow` changes, which is plain data and not reactive. */
    flowVersion = $state(0);

    /**
     * The server replays recent trades to every new subscription, and a
     * reconnect is a new subscription. Binance trade ids only increase, so
     * anything at or below the newest id already seen is a replay.
     */
    private newestTradeId = -1;
    private readonly offPair: () => void;
    private readonly offMarkets: () => void;

    constructor(symbol: string) {
        this.symbol = symbol;
        this.offPair = socket.subscribe(symbol, (m) => this.receive(m));
        this.offMarkets = socket.markets((m) => {
            if (m.type !== "markets") return;
            const mine = m.tickers.find((t) => t.symbol === symbol);
            if (mine) this.ticker = mine;
        });
    }

    resetFlow(): void {
        this.flow.reset();
        this.flowVersion += 1;
    }

    close(): void {
        this.offPair();
        this.offMarkets();
    }

    private receive(message: ServerMessage): void {
        switch (message.type) {
            case "subscribed":
                this.error = null;
                return;
            case "error":
                this.error = message.message;
                return;
            case "book":
                this.book = message.book;
                this.lastAt = Date.now();
                return;
            case "quote":
                this.quote = message.quote;
                this.lastAt = Date.now();
                return;
            case "candle":
                this.candle = message.candle;
                return;
            case "trades": {
                const fresh = message.trades.filter((t) => t.id > this.newestTradeId);
                if (fresh.length === 0) return;
                for (const trade of fresh) this.flow.add(trade);
                this.newestTradeId = fresh.at(-1)!.id;
                this.trades = [...fresh.reverse(), ...this.trades].slice(0, TAPE_LENGTH);
                this.flowVersion += 1;
                return;
            }
            default:
                return;
        }
    }
}
