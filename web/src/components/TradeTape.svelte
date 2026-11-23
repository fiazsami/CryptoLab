<script lang="ts">
    import type { PairInfo } from "../../../shared/protocol.ts";
    import { decimalsFromTick, formatPrice, formatQty } from "../../../shared/price.ts";
    import type { PairStream } from "../lib/pair-stream.svelte.ts";

    let { pair, stream }: { pair: PairInfo; stream: PairStream } = $props();

    const VISIBLE = 40;
    const decimals = $derived(decimalsFromTick(pair.tickSize));
    const visible = $derived(stream.trades.slice(0, VISIBLE));

    const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
</script>

<section class="panel">
    <h2>Trades <span class="muted">newest first</span></h2>
    {#if visible.length === 0}
        <p class="muted">Waiting for trades… quiet pairs can take a while.</p>
    {:else}
        <table>
            <thead>
                <tr><th class="num">Price</th><th class="num">Qty</th><th class="num">Time</th></tr>
            </thead>
            <tbody>
                {#each visible as trade (trade.id)}
                    <tr>
                        <td class="num" class:buy={trade.side === "buy"} class:sell={trade.side === "sell"}>
                            {formatPrice(trade.price, decimals)}
                        </td>
                        <td class="num">{formatQty(trade.qty)}</td>
                        <td class="num muted">{clock.format(trade.time)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}
</section>

<style>
    td,
    th {
        padding: 2px 6px;
        font-size: 13px;
    }
</style>
