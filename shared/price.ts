/**
 * Exact decimal arithmetic for display.
 *
 * Every price is held as a BigInt count of 10^-SCALE units. Binance sends at
 * most 8 decimal places, so a scale of 18 represents every price exactly, and
 * bucketing becomes integer floor/ceil rather than float rounding. The legacy
 * `numeric.js` did `Math.trunc(x * 10^p)`, which misrounds values such as
 * 1.005 and drifts as precision changes.
 *
 * `decimals` is the number of fractional digits to display. It may be negative
 * to group coarser than whole units: -1 buckets BTC prices by tens.
 */

const SCALE = 18;
const TEN = 10n;

function pow10(exponent: number): bigint {
    return TEN ** BigInt(exponent);
}

/** Parses a non-negative decimal string, e.g. "62712.41000000". */
export function toUnits(value: string): bigint {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        throw new Error(`not a non-negative decimal: "${value}"`);
    }
    const [whole = "0", fraction = ""] = trimmed.split(".");
    const padded = (fraction + "0".repeat(SCALE)).slice(0, SCALE);
    return BigInt(whole) * pow10(SCALE) + BigInt(padded);
}

/** Formats units with exactly max(decimals, 0) fractional digits. Truncates. */
export function formatUnits(units: bigint, decimals: number): string {
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const whole = abs / pow10(SCALE);
    const sign = negative ? "-" : "";
    if (decimals <= 0) return sign + whole.toString();
    const fraction = (abs % pow10(SCALE)).toString().padStart(SCALE, "0").slice(0, decimals);
    return `${sign}${whole}.${fraction}`;
}

/** Size of one bucket at `decimals`, in units. */
export function bucketSize(decimals: number): bigint {
    if (!Number.isInteger(decimals) || decimals > SCALE) {
        throw new RangeError(`decimals must be an integer <= ${SCALE}, got ${decimals}`);
    }
    return pow10(SCALE - decimals);
}

/**
 * Rounds to a bucket boundary. Bids round down and asks round up, so a grouped
 * book never shows a bid above, or an ask below, where liquidity really is.
 */
export function bucketUnits(units: bigint, decimals: number, mode: "floor" | "ceil"): bigint {
    const size = bucketSize(decimals);
    const remainder = units % size;
    if (remainder === 0n) return units;
    return mode === "floor" ? units - remainder : units - remainder + size;
}

export function bucket(price: string, decimals: number, mode: "floor" | "ceil"): string {
    return formatUnits(bucketUnits(toUnits(price), decimals, mode), decimals);
}

/**
 * Fractional digits in a tick size: "0.01000000" → 2, "1.00000000" → 0,
 * "0.00500000" → 3. A tick that is not a power of ten still displays at the
 * digits it needs.
 */
export function decimalsFromTick(tickSize: string): number {
    const fraction = tickSize.split(".")[1] ?? "";
    return fraction.replace(/0+$/, "").length;
}

/** Shows a price at a fixed number of decimals, truncating extra digits. */
export function formatPrice(price: string, decimals: number): string {
    return formatUnits(toUnits(price), decimals);
}

/** `ask - bid`, exactly, at `decimals`. */
export function spread(ask: string, bid: string, decimals: number): string {
    return formatUnits(toUnits(ask) - toUnits(bid), decimals);
}

/**
 * Compact quantity for tables: 4 significant digits below 1, up to 3 decimals
 * below 1000, then K/M/B. This is display only, so a float is fine here.
 */
export function formatQty(qty: string | number): string {
    const n = typeof qty === "number" ? qty : Number(qty);
    if (!Number.isFinite(n) || n === 0) return "";
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
    if (abs >= 1) return n.toFixed(abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 2 : 3);
    return n.toPrecision(4).replace(/0+$/, "");
}

/** Percent change from `open` to `last`, or null when `open` is zero. */
export function percentChange(open: string, last: string): number | null {
    const o = Number(open);
    if (!(o > 0)) return null;
    return ((Number(last) - o) / o) * 100;
}
