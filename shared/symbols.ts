/**
 * Turns what a person types into an exchange symbol.
 *
 * `eth/usdt`, `ETH-USDT`, `eth usdt` and `ethusdt` all mean `ETHUSDT`. Whether
 * that symbol exists is a separate question, answered against the live pair list.
 */
export function normalizeSymbol(input: string): string {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Binance stream names are lowercase. */
export function streamSymbol(symbol: string): string {
    return symbol.toLowerCase();
}
