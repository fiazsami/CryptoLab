import type { Candle, MarketTicker, PairInfo } from "../../../shared/protocol.ts";

/**
 * The three public REST calls the app needs. No API key is required for any of
 * them. Request weight is small: exchangeInfo and the all-symbol 24h ticker run
 * once at startup and then hourly, and klines run once per pair view opened.
 */

type Fetch = typeof fetch;

const TIMEOUT_MS = 10_000;

export class BinanceRest {
    private readonly baseUrl: string;
    private readonly fetchFn: Fetch;

    constructor(baseUrl: string, fetchFn: Fetch = fetch) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.fetchFn = fetchFn;
    }

    async pairs(): Promise<PairInfo[]> {
        const body = (await this.get("/api/v3/exchangeInfo")) as { symbols?: RawSymbol[] };
        if (!Array.isArray(body.symbols)) throw new Error("exchangeInfo: no symbols in response");
        return body.symbols.map(toPairInfo);
    }

    async tickers(): Promise<MarketTicker[]> {
        const body = await this.get("/api/v3/ticker/24hr");
        if (!Array.isArray(body)) throw new Error("ticker/24hr: expected an array");
        return (body as RawTicker24h[]).map((t) => ({
            symbol: t.symbol,
            last: t.lastPrice,
            open: t.openPrice,
            high: t.highPrice,
            low: t.lowPrice,
            volume: t.volume,
            quoteVolume: t.quoteVolume,
        }));
    }

    async klines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
        const query = new URLSearchParams({ symbol, interval, limit: String(limit) });
        const body = await this.get(`/api/v3/klines?${query}`);
        if (!Array.isArray(body)) throw new Error("klines: expected an array");
        const now = Date.now();
        return (body as RawKline[]).map((k) => ({
            openTime: k[0],
            open: k[1],
            high: k[2],
            low: k[3],
            close: k[4],
            volume: k[5],
            closed: k[6] < now,
        }));
    }

    private async get(path: string): Promise<unknown> {
        const url = this.baseUrl + path;
        const response = await this.fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`GET ${path} → HTTP ${response.status}: ${text.slice(0, 200)}`);
        }
        return response.json();
    }
}

interface RawFilter {
    filterType: string;
    tickSize?: string;
    stepSize?: string;
}

interface RawSymbol {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    filters?: RawFilter[];
}

interface RawTicker24h {
    symbol: string;
    lastPrice: string;
    openPrice: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
}

/** [openTime, open, high, low, close, volume, closeTime, ...] */
type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

export function toPairInfo(raw: RawSymbol): PairInfo {
    const filters = raw.filters ?? [];
    return {
        symbol: raw.symbol,
        base: raw.baseAsset,
        quote: raw.quoteAsset,
        status: raw.status,
        tickSize: filters.find((f) => f.filterType === "PRICE_FILTER")?.tickSize ?? "0.00000001",
        stepSize: filters.find((f) => f.filterType === "LOT_SIZE")?.stepSize ?? "0.00000001",
    };
}
