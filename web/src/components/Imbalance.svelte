<script lang="ts">
    import type { PairInfo } from "../../../shared/protocol.ts";
    import { decimalsFromTick, formatQty } from "../../../shared/price.ts";
    import { PRECISION_SPAN } from "../lib/book.ts";
    import { volumeStyle } from "../lib/colors.ts";
    import type { PairStream } from "../lib/pair-stream.svelte.ts";

    let { pair, stream }: { pair: PairInfo; stream: PairStream } = $props();

    const ROWS = 20;
    const maxDecimals = $derived(decimalsFromTick(pair.tickSize));
    const minDecimals = $derived(maxDecimals - PRECISION_SPAN);

    // One step coarser than the tick by default, so buckets collect several prices.
    let chosen = $state<number | null>(null);
    const decimals = $derived(chosen ?? maxDecimals - 1);

    const rows = $derived.by(() => {
        void stream.flowVersion;
        return stream.flow.ladder(decimals, ROWS);
    });

    function setDecimals(next: number): void {
        chosen = Math.max(minDecimals, Math.min(maxDecimals, next));
    }
</script>

<section class="panel">
    <h2>
        Imbalance
        <span class="muted">since open</span>
        <span class="tools">
            <button onclick={() => setDecimals(decimals - 1)} disabled={decimals <= minDecimals} title="Coarser">−</button>
            <button onclick={() => setDecimals(decimals + 1)} disabled={decimals >= maxDecimals} title="Finer">+</button>
            <button onclick={() => stream.resetFlow()} title="Clear the accumulated volume">reset</button>
        </span>
    </h2>

    {#if rows.length === 0}
        <p class="muted">Waiting for trades…</p>
    {:else}
        <table>
            <thead>
                <tr><th class="num">Sold</th><th class="num">Price</th><th class="num">Bought</th></tr>
            </thead>
            <tbody>
                {#each rows as row (row.units)}
                    {@const net = row.buy - row.sell}
                    <tr class:last={row.isLast}>
                        <td class="num" class:sell={net < 0} class:dim={net >= 0}>{formatQty(row.sell)}</td>
                        <td class="num price" style={volumeStyle(row.price)}>{row.price}</td>
                        <td class="num" class:buy={net > 0} class:dim={net <= 0}>{formatQty(row.buy)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <p class="hint muted">Aggressor volume per bucket. The brighter side is the net. The outlined row holds the last trade.</p>
    {/if}
</section>

<style>
    td,
    th {
        padding: 2px 8px;
        font-size: 13px;
    }

    td.price {
        text-align: center;
    }

    .dim {
        color: var(--muted);
        opacity: 0.6;
    }

    tr.last td {
        border-top: 1px solid #aaa;
        border-bottom: 1px solid #aaa;
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
