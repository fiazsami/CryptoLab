<script lang="ts">
    import {
        CandlestickSeries,
        HistogramSeries,
        createChart,
        type CandlestickData,
        type HistogramData,
        type UTCTimestamp,
    } from "lightweight-charts";
    import type { Candle, PairInfo } from "../../../shared/protocol.ts";
    import { decimalsFromTick } from "../../../shared/price.ts";
    import type { PairStream } from "../lib/pair-stream.svelte.ts";

    let { pair, stream }: { pair: PairInfo; stream: PairStream } = $props();

    let container: HTMLDivElement | undefined = $state();
    let error = $state<string | null>(null);

    /** Set while a chart exists; the live-candle effect feeds it. */
    let push: ((candle: Candle) => void) | null = null;

    function toBar(c: Candle): CandlestickData<UTCTimestamp> {
        return {
            time: (c.openTime / 1000) as UTCTimestamp,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
        };
    }

    function toVolume(c: Candle): HistogramData<UTCTimestamp> {
        const up = Number(c.close) >= Number(c.open);
        return {
            time: (c.openTime / 1000) as UTCTimestamp,
            value: Number(c.volume),
            color: up ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
        };
    }

    $effect(() => {
        if (!container) return;
        const decimals = decimalsFromTick(pair.tickSize);

        const chart = createChart(container, {
            autoSize: true,
            layout: { background: { color: "transparent" }, textColor: "#8a8f98" },
            grid: { vertLines: { color: "#22252b" }, horzLines: { color: "#22252b" } },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        });
        const candles = chart.addSeries(CandlestickSeries, {
            upColor: "#26a69a",
            downColor: "#ef5350",
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350",
            borderVisible: false,
            priceFormat: { type: "price", precision: Math.max(decimals, 0), minMove: Number(pair.tickSize) },
        });
        const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
        volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        // Live candles can arrive before the history does. Hold the newest one
        // until the seed lands. After that, ignore anything older than the last
        // bar, because the chart throws on an out-of-order update.
        let seeded = false;
        let lastTime = 0;
        let held: Candle | null = null;

        const apply = (c: Candle) => {
            const time = c.openTime / 1000;
            if (time < lastTime) return;
            candles.update(toBar(c));
            volume.update(toVolume(c));
            lastTime = time;
        };

        push = (c) => {
            if (seeded) apply(c);
            else held = c;
        };

        const controller = new AbortController();
        fetch(`/api/klines?symbol=${encodeURIComponent(pair.symbol)}&interval=1m&limit=500`, { signal: controller.signal })
            .then(async (response) => {
                const body = (await response.json()) as { candles?: Candle[]; error?: string };
                if (!response.ok || !body.candles) throw new Error(body.error ?? `HTTP ${response.status}`);
                candles.setData(body.candles.map(toBar));
                volume.setData(body.candles.map(toVolume));
                lastTime = body.candles.length > 0 ? body.candles.at(-1)!.openTime / 1000 : 0;
                seeded = true;
                if (held) apply(held);
                held = null;
                error = null;
            })
            .catch((e: unknown) => {
                if (controller.signal.aborted) return;
                error = e instanceof Error ? e.message : String(e);
                seeded = true; // Live candles still draw without history.
            });

        return () => {
            controller.abort();
            push = null;
            chart.remove();
        };
    });

    $effect(() => {
        const candle = stream.candle;
        if (candle) push?.(candle);
    });
</script>

<section class="panel">
    <h2>1m candles <span class="muted">UTC · last 500 minutes</span></h2>
    {#if error}<p class="muted">History unavailable: {error}. Showing live candles only.</p>{/if}
    <div class="chart" bind:this={container}></div>
</section>

<style>
    .chart {
        height: 340px;
        width: 100%;
    }
</style>
