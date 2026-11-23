<script lang="ts">
    import type { MarketTicker, PairInfo } from "../../../shared/protocol.ts";
    import { decimalsFromTick, formatPrice, formatQty, percentChange } from "../../../shared/price.ts";
    import { pairs } from "../lib/pairs.svelte.ts";
    import { pairPath } from "../lib/routes.ts";
    import { socket } from "../lib/socket.svelte.ts";
    import { navigate } from "../router.svelte.ts";

    type SortKey = "symbol" | "last" | "change" | "quoteVolume";

    let tickers = $state.raw(new Map<string, MarketTicker>());
    let filter = $state("");
    let quote = $state<string | null>(null);
    let showHalted = $state(false);
    let sortKey = $state<SortKey>("quoteVolume");
    let descending = $state(true);

    $effect(() =>
        socket.markets((message) => {
            if (message.type !== "markets") return;
            // Built locally, then swapped into $state.raw whole; never mutated while reactive.
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            const next = message.full ? new Map<string, MarketTicker>() : new Map(tickers);
            for (const t of message.tickers) next.set(t.symbol, t);
            tickers = next;
        }),
    );

    /** Quote assets by pair count. The busiest is the default tab. */
    const quotes = $derived.by(() => {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to this derivation
        const counts = new Map<string, number>();
        for (const p of pairs.list) if (p.status === "TRADING") counts.set(p.quote, (counts.get(p.quote) ?? 0) + 1);
        return [...counts].sort((a, b) => b[1] - a[1]);
    });

    const activeQuote = $derived(quote ?? quotes[0]?.[0] ?? null);

    interface Row {
        pair: PairInfo;
        ticker: MarketTicker | undefined;
        change: number | null;
        decimals: number;
    }

    const rows = $derived.by(() => {
        const needle = filter.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        const out: Row[] = [];
        for (const pair of pairs.list) {
            if (!showHalted && pair.status !== "TRADING") continue;
            if (activeQuote && quote !== "ALL" && pair.quote !== activeQuote) continue;
            if (needle && !pair.symbol.includes(needle)) continue;
            const ticker = tickers.get(pair.symbol);
            out.push({
                pair,
                ticker,
                change: ticker ? percentChange(ticker.open, ticker.last) : null,
                decimals: decimalsFromTick(pair.tickSize),
            });
        }
        const sign = descending ? -1 : 1;
        const value = (r: Row): number | string => {
            switch (sortKey) {
                case "symbol":
                    return r.pair.symbol;
                case "last":
                    return Number(r.ticker?.last ?? 0);
                case "change":
                    return r.change ?? Number.NEGATIVE_INFINITY;
                case "quoteVolume":
                    return Number(r.ticker?.quoteVolume ?? 0);
            }
        };
        return out.sort((a, b) => {
            const va = value(a);
            const vb = value(b);
            if (typeof va === "string" && typeof vb === "string") return sign * va.localeCompare(vb);
            return sign * (Number(va) - Number(vb));
        });
    });

    function sortBy(key: SortKey): void {
        if (sortKey === key) descending = !descending;
        else {
            sortKey = key;
            descending = key !== "symbol";
        }
    }

    function arrow(key: SortKey): string {
        return sortKey === key ? (descending ? " ↓" : " ↑") : "";
    }
</script>

<svelte:head><title>Markets · CryptoLab</title></svelte:head>

<section class="panel">
    <div class="controls">
        <div class="chips">
            {#each quotes as [q, count] (q)}
                <button class:active={activeQuote === q && quote !== "ALL"} onclick={() => (quote = q)}>
                    {q} <span class="muted">{count}</span>
                </button>
            {/each}
            <button class:active={quote === "ALL"} onclick={() => (quote = "ALL")}>All</button>
        </div>
        <input bind:value={filter} placeholder="Filter…" spellcheck="false" aria-label="Filter pairs" />
        <label class="muted"><input type="checkbox" bind:checked={showHalted} /> show halted</label>
    </div>

    {#if !pairs.loaded}
        <p class="muted">Loading pairs…</p>
    {:else}
        <table>
            <thead>
                <tr>
                    <th><button class="th" onclick={() => sortBy("symbol")}>Pair{arrow("symbol")}</button></th>
                    <th class="num"><button class="th" onclick={() => sortBy("last")}>Last{arrow("last")}</button></th>
                    <th class="num"><button class="th" onclick={() => sortBy("change")}>24h{arrow("change")}</button></th>
                    <th class="num">High</th>
                    <th class="num">Low</th>
                    <th class="num">
                        <button class="th" onclick={() => sortBy("quoteVolume")}>Volume{arrow("quoteVolume")}</button>
                    </th>
                </tr>
            </thead>
            <tbody>
                {#each rows as row (row.pair.symbol)}
                    <tr onclick={() => navigate(pairPath(row.pair.symbol))}>
                        <td>
                            <a href={pairPath(row.pair.symbol)}><strong>{row.pair.base}</strong><span class="muted">/{row.pair.quote}</span></a>
                            {#if row.pair.status !== "TRADING"}<span class="halted">{row.pair.status}</span>{/if}
                        </td>
                        <td class="num">{row.ticker ? formatPrice(row.ticker.last, row.decimals) : "—"}</td>
                        <td class="num" class:buy={(row.change ?? 0) > 0} class:sell={(row.change ?? 0) < 0}>
                            {row.change === null ? "—" : `${row.change > 0 ? "+" : ""}${row.change.toFixed(2)}%`}
                        </td>
                        <td class="num muted">{row.ticker ? formatPrice(row.ticker.high, row.decimals) : ""}</td>
                        <td class="num muted">{row.ticker ? formatPrice(row.ticker.low, row.decimals) : ""}</td>
                        <td class="num">{row.ticker ? `${formatQty(row.ticker.quoteVolume)} ${row.pair.quote}` : ""}</td>
                    </tr>
                {:else}
                    <tr><td colspan="6" class="muted">No pairs match.</td></tr>
                {/each}
            </tbody>
        </table>
        <p class="muted foot">{rows.length} pairs · volume is in each pair's quote asset, so compare it only within one tab</p>
    {/if}
</section>

<style>
    .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
    }

    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .controls > input {
        padding: 4px 8px;
        background: var(--bg);
        color: var(--text);
        border: 1px solid var(--line);
        border-radius: 4px;
        font: inherit;
    }

    th,
    td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--line);
    }

    th {
        text-align: left;
    }

    th.num {
        text-align: right;
    }

    button.th {
        background: none;
        border: none;
        padding: 0;
        color: inherit;
        font-size: inherit;
    }

    tbody tr {
        cursor: pointer;
    }

    tbody tr:hover {
        background: #1f2228;
    }

    td a {
        color: var(--text);
        text-decoration: none;
    }

    .halted {
        margin-left: 6px;
        font-size: 11px;
        color: var(--warn);
    }

    .foot {
        font-size: 12px;
        margin: 8px 0 0;
    }
</style>
