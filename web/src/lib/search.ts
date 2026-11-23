import type { PairInfo } from "../../../shared/protocol.ts";
import { normalizeSymbol } from "../../../shared/symbols.ts";

/** When several pairs share a base, the more liquid quote assets come first. */
const QUOTE_PREFERENCE = ["USD", "USDT", "USDC", "BTC", "ETH"];

function quoteRank(quote: string): number {
    const i = QUOTE_PREFERENCE.indexOf(quote);
    return i === -1 ? QUOTE_PREFERENCE.length : i;
}

/**
 * Ranks pairs for the search box. In order:
 * 1. exact symbol
 * 2. exact base (`eth` → ETHUSD, ETHUSDT…)
 * 3. symbol prefix
 * 4. base prefix
 * 5. substring
 *
 * A separator in the query (`eth/u`, `eth-usd`) splits it into a base and a
 * quote prefix. Trading pairs sort above halted ones.
 */
export function rankPairs(pairs: readonly PairInfo[], query: string, limit = 8): PairInfo[] {
    const q = normalizeSymbol(query);
    if (!q) return [];

    const parts = query
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(Boolean);
    const split = parts.length === 2 ? { base: parts[0]!, quote: parts[1]! } : null;

    const scored: { pair: PairInfo; score: number }[] = [];
    for (const pair of pairs) {
        let score: number;
        if (split) {
            if (pair.base === split.base && pair.quote.startsWith(split.quote)) score = pair.quote === split.quote ? 0 : 1;
            else continue;
        } else if (pair.symbol === q) score = 0;
        else if (pair.base === q) score = 1;
        else if (pair.symbol.startsWith(q)) score = 2;
        else if (pair.base.startsWith(q)) score = 3;
        else if (pair.symbol.includes(q)) score = 4;
        else continue;
        scored.push({ pair, score });
    }

    scored.sort(
        (a, b) =>
            a.score - b.score ||
            Number(b.pair.status === "TRADING") - Number(a.pair.status === "TRADING") ||
            quoteRank(a.pair.quote) - quoteRank(b.pair.quote) ||
            a.pair.symbol.localeCompare(b.pair.symbol),
    );
    return scored.slice(0, limit).map((s) => s.pair);
}
