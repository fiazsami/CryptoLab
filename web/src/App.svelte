<script lang="ts">
    import { navigate, router } from "./router.svelte.ts";
    import { pairs } from "./lib/pairs.svelte.ts";
    import { socket } from "./lib/socket.svelte.ts";
    import PairSearch from "./components/PairSearch.svelte";
    import Markets from "./views/Markets.svelte";
    import Pair from "./views/Pair.svelte";

    void pairs.load();

    const status = $derived(
        !socket.connected ? "server offline" : socket.upstream === "open" ? "live" : socket.upstream,
    );

    /** Same-origin links navigate in place instead of reloading the page. */
    function interceptLinks(event: MouseEvent): void {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = (event.target as Element | null)?.closest("a");
        if (!anchor || anchor.target || anchor.origin !== location.origin) return;
        event.preventDefault();
        navigate(anchor.pathname);
    }
</script>

<svelte:document onclick={interceptLinks} />

<header class="top">
    <a class="brand" href="/">CryptoLab</a>
    <PairSearch />
    <span class="status" class:ok={status === "live"} title="Connection to the server and to {socket.exchange}">
        {socket.exchange} · {status}
    </span>
</header>

<main>
    {#if pairs.error}
        <p class="notice error">Could not load the pair list: {pairs.error}</p>
    {/if}

    {#if router.route.name === "markets"}
        <Markets />
    {:else if router.route.name === "pair"}
        {#key router.route.symbol}
            <Pair symbol={router.route.symbol} />
        {/key}
    {:else}
        <p class="notice">Nothing at <code>{router.route.path}</code>. <a href="/">Browse all pairs</a>.</p>
    {/if}
</main>

<footer>
    Public market data from {socket.exchange}. Charts by
    <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">TradingView Lightweight Charts</a>.
</footer>
