<script lang="ts">
    import type { PairInfo } from "../../../shared/protocol.ts";
    import { decimalsFromTick, formatQty } from "../../../shared/price.ts";
    import { PRECISION_SPAN, pairDepth } from "../lib/book.ts";
    import { level2Style } from "../lib/colors.ts";
    import type { PairStream } from "../lib/pair-stream.svelte.ts";

    let { pair, stream }: { pair: PairInfo; stream: PairStream } = $props();

    const ROWS = 20;
    const maxDecimals = $derived(decimalsFromTick(pair.tickSize));
    const minDecimals = $derived(maxDecimals - PRECISION_SPAN);

    // Start at the pair's own tick; the keys only group coarser from there.
    let chosen = $state<number | null>(null);
    const decimals = $derived(chosen ?? maxDecimals);

    const rows = $derived(stream.book ? pairDepth(stream.book, decimals, ROWS) : []);

    /** Traded volume at each displayed price, since the page opened. */
    const traded = $derived.by(() => {
        void stream.flowVersion;
        return stream.flow.grouped(decimals);
    });

    const maxQty = $derived(Math.max(1e-12, ...rows.flatMap((r) => [r.bid?.qty ?? 0, r.ask?.qty ?? 0])));

    function setDecimals(next: number): void {
        chosen = Math.max(minDecimals, Math.min(maxDecimals, next));
    }

    // Matches the legacy userEvents.js, including the direction: ↓ adds a decimal.
    function onkeydown(event: KeyboardEvent): void {
        const target = event.target;
        if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (event.key === "ArrowDown") setDecimals(decimals + 1);
        else if (event.key === "ArrowUp") setDecimals(decimals - 1);
        else return;
        event.preventDefault();
    }

    function bar(qty: number | undefined, side: "bid" | "ask"): string {
        const pct = qty ? Math.min(100, (qty / maxQty) * 100) : 0;
        const color = side === "bid" ? "38 166 154" : "239 83 80";
        const direction = side === "bid" ? "to left" : "to right";
        return `background:linear-gradient(${direction}, rgb(${color} / 0.22) ${pct}%, transparent ${pct}%)`;
    }
</script>

<svelte:window {onkeydown} />

<section class="panel">
    <h2>
        Order book
        <span class="muted">depth {rows.length} · grouped to {decimals > 0 ? `0.${"0".repeat(decimals - 1)}1` : `1${"0".repeat(-decimals)}`}</span>
        <span class="tools">
            <button onclick={() => setDecimals(decimals - 1)} disabled={decimals <= minDecimals} title="Coarser (↑)">−</button>
            <button onclick={() => setDecimals(decimals + 1)} disabled={decimals >= maxDecimals} title="Finer (↓)">+</button>
        </span>
    </h2>

    {#if rows.length === 0}
        <p class="muted">Waiting for the book…</p>
    {:else}
        <table>
            <thead>
                <tr>
                    <th class="num">Bid qty</th>
                    <th class="num">Traded</th>
                    <th class="num">Bid</th>
                    <th class="num">Spread</th>
                    <th class="num">Ask</th>
                    <th class="num">Traded</th>
                    <th class="num">Ask qty</th>
                </tr>
            </thead>
            <tbody>
                {#each rows as row, i (i)}
                    <tr>
                        <td class="num qty" style={bar(row.bid?.qty, "bid")}>{row.bid ? formatQty(row.bid.qty) : ""}</td>
                        <td class="num muted">{row.bid ? formatQty(traded.sells.get(row.bid.units) ?? 0) : ""}</td>
                        <td class="num price" style={row.bid ? level2Style(row.bid.price) : ""}>{row.bid?.price ?? ""}</td>
                        <td class="num spread" style={row.spread ? level2Style(row.spread) : ""}>{row.spread ?? ""}</td>
                        <td class="num price" style={row.ask ? level2Style(row.ask.price) : ""}>{row.ask?.price ?? ""}</td>
                        <td class="num muted">{row.ask ? formatQty(traded.buys.get(row.ask.units) ?? 0) : ""}</td>
                        <td class="num qty" style={bar(row.ask?.qty, "ask")}>{row.ask ? formatQty(row.ask.qty) : ""}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <p class="hint muted"><kbd>↑</kbd> coarser · <kbd>↓</kbd> finer · rows pair the i-th bid with the i-th ask</p>
    {/if}
</section>

<style>
    td,
    th {
        padding: 3px 8px;
    }

    td.price,
    td.spread {
        text-align: center;
        font-weight: 500;
    }

    td.spread {
        font-size: 12px;
    }

    .hint {
        margin: 8px 0 0;
        font-size: 11px;
    }

    button:disabled {
        opacity: 0.4;
        cursor: default;
    }
</style>
