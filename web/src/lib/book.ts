import type { Book, Level } from "../../../shared/protocol.ts";
import { bucketUnits, formatUnits, toUnits } from "../../../shared/price.ts";

/**
 * Groups one side of the book at a display precision. Levels arrive best
 * first, so equal buckets are adjacent and are merged by summing quantity.
 * Bids round down and asks round up, so a grouped price never claims liquidity
 * nearer the touch than it really is.
 */
export interface GroupedLevel {
    units: bigint;
    price: string;
    qty: number;
}

export function groupSide(levels: readonly Level[], decimals: number, mode: "floor" | "ceil"): GroupedLevel[] {
    const out: GroupedLevel[] = [];
    for (const [price, qty] of levels) {
        const units = bucketUnits(toUnits(price), decimals, mode);
        const previous = out.at(-1);
        if (previous && previous.units === units) previous.qty += Number(qty);
        else out.push({ units, price: formatUnits(units, decimals), qty: Number(qty) });
    }
    return out;
}

export interface LadderRow {
    bid: GroupedLevel | undefined;
    ask: GroupedLevel | undefined;
    /** `ask - bid` for this depth, when both sides have a level. */
    spread: string | null;
}

/**
 * The legacy level2 layout: depth-paired, not a price ladder. Row i is the
 * i-th bid beside the i-th ask, so reading down walks outward from the touch.
 */
export function pairDepth(book: Book, decimals: number, rows: number): LadderRow[] {
    const bids = groupSide(book.bids, decimals, "floor");
    const asks = groupSide(book.asks, decimals, "ceil");
    const n = Math.min(rows, Math.max(bids.length, asks.length));
    const out: LadderRow[] = [];
    for (let i = 0; i < n; i++) {
        const bid = bids[i];
        const ask = asks[i];
        out.push({
            bid,
            ask,
            spread: bid && ask ? formatUnits(ask.units - bid.units, decimals) : null,
        });
    }
    return out;
}

/** How many steps coarser than the tick the precision keys may group. */
export const PRECISION_SPAN = 6;
