import type { Trade } from "../../../shared/protocol.ts";
import { bucketSize, bucketUnits, formatUnits, toUnits } from "../../../shared/price.ts";

/**
 * Traded volume per price, split by aggressor, since the page opened (or the
 * last reset). This is the port of the legacy `tradebook.js`.
 *
 * Trades are held at their exact price and grouped only when read, so changing
 * the display precision regroups history instead of losing it. Buys lift the
 * ask, so they group upward; sells hit the bid, so they group downward. That
 * matches how the order book groups each side, so a book row and its traded
 * column always describe the same price range.
 */

export interface FlowTotals {
    buy: number;
    sell: number;
}

export interface FlowRow extends FlowTotals {
    price: string;
    units: bigint;
    isLast: boolean;
}

export class FlowBook {
    private readonly buys = new Map<bigint, number>();
    private readonly sells = new Map<bigint, number>();
    private last: bigint | null = null;

    add(trade: Trade): void {
        const units = toUnits(trade.price);
        const qty = Number(trade.qty);
        const side = trade.side === "buy" ? this.buys : this.sells;
        side.set(units, (side.get(units) ?? 0) + qty);
        this.last = units;
    }

    reset(): void {
        this.buys.clear();
        this.sells.clear();
    }

    lastUnits(): bigint | null {
        return this.last;
    }

    /** Buy totals keyed by ceil bucket, sell totals by floor bucket. */
    grouped(decimals: number): { buys: Map<bigint, number>; sells: Map<bigint, number> } {
        return {
            buys: regroup(this.buys, decimals, "ceil"),
            sells: regroup(this.sells, decimals, "floor"),
        };
    }

    /** `rows` consecutive buckets around the last trade, highest price first. */
    ladder(decimals: number, rows: number): FlowRow[] {
        if (this.last === null) return [];
        const size = bucketSize(decimals);
        const center = bucketUnits(this.last, decimals, "floor");
        // One price column, so both sides group the same way here, unlike the book.
        const buys = regroup(this.buys, decimals, "floor");
        const sells = regroup(this.sells, decimals, "floor");
        const above = Math.floor(rows / 2) - 1;

        const out: FlowRow[] = [];
        for (let i = above; i > above - rows; i--) {
            const units = center + size * BigInt(i);
            if (units < 0n) break;
            out.push({
                units,
                price: formatUnits(units, decimals),
                buy: buys.get(units) ?? 0,
                sell: sells.get(units) ?? 0,
                isLast: units === center,
            });
        }
        return out;
    }
}

function regroup(source: Map<bigint, number>, decimals: number, mode: "floor" | "ceil"): Map<bigint, number> {
    const out = new Map<bigint, number>();
    for (const [units, qty] of source) {
        const key = bucketUnits(units, decimals, mode);
        out.set(key, (out.get(key) ?? 0) + qty);
    }
    return out;
}
