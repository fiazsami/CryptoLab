<script lang="ts">
    import { PairStream } from "../lib/pair-stream.svelte.ts";
    import { pairs } from "../lib/pairs.svelte.ts";
    import { pairPath } from "../lib/routes.ts";
    import { rankPairs } from "../lib/search.ts";
    import CandleChart from "../components/CandleChart.svelte";
    import Imbalance from "../components/Imbalance.svelte";
    import OrderBook from "../components/OrderBook.svelte";
    import QuoteHeader from "../components/QuoteHeader.svelte";
    import TradeTape from "../components/TradeTape.svelte";

    let { symbol }: { symbol: string } = $props();

    const pair = $derived(pairs.get(symbol));
    const unknown = $derived(pairs.loaded && !pair);
    const suggestions = $derived(unknown ? rankPairs(pairs.list, symbol.slice(0, 3), 6) : []);

    let stream = $state.raw<PairStream | null>(null);

    // Subscribe only for listed, trading pairs. The server would refuse anything
    // else anyway, but this keeps the reason on screen instead of an error frame.
    $effect(() => {
        if (!pair || pair.status !== "TRADING") return;
        const s = new PairStream(pair.symbol);
        stream = s;
        return () => {
            s.close();
            stream = null;
        };
    });
</script>

<svelte:head><title>{symbol} · CryptoLab</title></svelte:head>

{#if unknown}
    <div class="notice">
        <p><strong>{symbol}</strong> is not listed on {pairs.exchange}.</p>
        {#if suggestions.length > 0}
            <p>
                Did you mean
                {#each suggestions as s, i (s.symbol)}{i > 0 ? ", " : ""}<a href={pairPath(s.symbol)}>{s.base}/{s.quote}</a>{/each}?
            </p>
        {/if}
        <p><a href="/">Browse all pairs</a></p>
    </div>
{:else if pair && pair.status !== "TRADING"}
    <div class="notice">
        <strong>{pair.base}/{pair.quote}</strong> is listed but not trading (status <code>{pair.status}</code>), so there is nothing to stream.
    </div>
{:else if !pair || !stream}
    <p class="muted">Loading {symbol}…</p>
{:else}
    {#if stream.error}
        <p class="notice error">{stream.error}</p>
    {/if}
    <QuoteHeader {pair} {stream} />
    <div class="grid">
        <div class="book"><OrderBook {pair} {stream} /></div>
        <div class="chart"><CandleChart {pair} {stream} /></div>
        <div class="flow"><Imbalance {pair} {stream} /></div>
        <div class="tape"><TradeTape {pair} {stream} /></div>
    </div>
{/if}

<style>
    .grid {
        display: grid;
        gap: 12px;
        margin-top: 12px;
        grid-template-columns: minmax(420px, 1fr) minmax(260px, 0.8fr) minmax(240px, 0.6fr);
        grid-template-areas:
            "book chart chart"
            "book flow tape";
    }

    .book {
        grid-area: book;
    }

    .chart {
        grid-area: chart;
    }

    .flow {
        grid-area: flow;
    }

    .tape {
        grid-area: tape;
    }

    .grid > div {
        min-width: 0;
        display: flex;
        flex-direction: column;
    }

    .grid > div > :global(.panel) {
        flex: 1;
    }

    @media (max-width: 1100px) {
        .grid {
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
                "book book"
                "chart chart"
                "flow tape";
        }
    }

    @media (max-width: 700px) {
        .grid {
            grid-template-columns: 1fr;
            grid-template-areas: "book" "chart" "flow" "tape";
        }
    }
</style>
