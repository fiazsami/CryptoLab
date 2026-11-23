<script lang="ts">
    import type { PairInfo } from "../../../shared/protocol.ts";
    import { decimalsFromTick, formatPrice, formatQty, percentChange, spread } from "../../../shared/price.ts";
    import type { PairStream } from "../lib/pair-stream.svelte.ts";
    import { socket } from "../lib/socket.svelte.ts";

    let { pair, stream }: { pair: PairInfo; stream: PairStream } = $props();

    const STALE_MS = 5_000;

    const decimals = $derived(decimalsFromTick(pair.tickSize));
    const quote = $derived(stream.quote);
    const ticker = $derived(stream.ticker);
    const last = $derived(stream.trades[0]?.price ?? ticker?.last ?? null);
    const lastSide = $derived(stream.trades[0]?.side ?? null);
    const change = $derived(ticker ? percentChange(ticker.open, last ?? ticker.last) : null);

    let now = $state(Date.now());
    $effect(() => {
        const timer = setInterval(() => (now = Date.now()), 1_000);
        return () => clearInterval(timer);
    });

    const age = $derived(stream.lastAt === 0 ? null : now - stream.lastAt);
    const health = $derived.by(() => {
        if (!socket.connected) return { text: "server offline", bad: true };
        if (socket.upstream !== "open") return { text: `${socket.exchange} ${socket.upstream}`, bad: true };
        if (age === null) return { text: "waiting for data", bad: true };
        if (age > STALE_MS) return { text: `stale ${Math.round(age / 1000)}s`, bad: true };
        return { text: "live", bad: false };
    });
</script>

<section class="panel header">
    <div class="name">
        <h1>{pair.base}<span class="muted">/{pair.quote}</span></h1>
        <span class="health" class:bad={health.bad}>{health.text}</span>
    </div>

    <div class="stat last">
        <span class="label">Last</span>
        <span class="value num" class:buy={lastSide === "buy"} class:sell={lastSide === "sell"}>
            {last ? formatPrice(last, decimals) : "—"}
        </span>
    </div>
    <div class="stat">
        <span class="label">24h</span>
        <span class="value num" class:buy={(change ?? 0) > 0} class:sell={(change ?? 0) < 0}>
            {change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
        </span>
    </div>
    <div class="stat">
        <span class="label">Bid</span>
        <span class="value num buy">{quote ? formatPrice(quote.bid, decimals) : "—"}</span>
        <span class="sub num muted">{quote ? formatQty(quote.bidQty) : ""}</span>
    </div>
    <div class="stat">
        <span class="label">Ask</span>
        <span class="value num sell">{quote ? formatPrice(quote.ask, decimals) : "—"}</span>
        <span class="sub num muted">{quote ? formatQty(quote.askQty) : ""}</span>
    </div>
    <div class="stat">
        <span class="label">Spread</span>
        <span class="value num">{quote ? spread(quote.ask, quote.bid, decimals) : "—"}</span>
    </div>
    <div class="stat">
        <span class="label">24h high / low</span>
        <span class="value num">
            {ticker ? `${formatPrice(ticker.high, decimals)} / ${formatPrice(ticker.low, decimals)}` : "—"}
        </span>
    </div>
    <div class="stat">
        <span class="label">24h volume</span>
        <span class="value num">{ticker ? `${formatQty(ticker.quoteVolume)} ${pair.quote}` : "—"}</span>
    </div>
</section>

<style>
    .header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px 28px;
    }

    .name {
        display: flex;
        align-items: baseline;
        gap: 10px;
    }

    h1 {
        margin: 0;
        font-size: 22px;
    }

    .health {
        font-size: 12px;
        color: var(--buy);
    }

    .health.bad {
        color: var(--warn);
    }

    .stat {
        display: flex;
        flex-direction: column;
    }

    .label {
        font-size: 11px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .value {
        font-size: 16px;
        text-align: left;
    }

    .last .value {
        font-size: 20px;
        font-weight: 600;
    }

    .sub {
        font-size: 11px;
        text-align: left;
    }
</style>
