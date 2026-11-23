<script lang="ts">
    import { normalizeSymbol } from "../../../shared/symbols.ts";
    import { pairs } from "../lib/pairs.svelte.ts";
    import { pairPath } from "../lib/routes.ts";
    import { rankPairs } from "../lib/search.ts";
    import { navigate } from "../router.svelte.ts";

    let input: HTMLInputElement | undefined = $state();
    let query = $state("");
    let open = $state(false);
    let active = $state(0);

    const results = $derived(rankPairs(pairs.list, query, 8));

    function go(symbol: string): void {
        navigate(pairPath(symbol));
        query = "";
        open = false;
        input?.blur();
    }

    function onkeydown(event: KeyboardEvent): void {
        if (event.key === "ArrowDown") {
            active = Math.min(active + 1, results.length - 1);
            event.preventDefault();
        } else if (event.key === "ArrowUp") {
            active = Math.max(active - 1, 0);
            event.preventDefault();
        } else if (event.key === "Enter") {
            const picked = results[active];
            if (picked) go(picked.symbol);
            // Unknown symbols still navigate, and the pair view says it isn't listed.
            else if (normalizeSymbol(query)) go(query);
        } else if (event.key === "Escape") {
            open = false;
            input?.blur();
        }
    }

    /** `/` focuses the search from anywhere, as on most market sites. */
    function onGlobalKey(event: KeyboardEvent): void {
        if (event.key !== "/" || isTyping(event.target)) return;
        event.preventDefault();
        input?.focus();
    }

    function isTyping(target: EventTarget | null): boolean {
        return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    }
</script>

<svelte:window onkeydown={onGlobalKey} />

<div class="search">
    <input
        bind:this={input}
        bind:value={query}
        oninput={() => {
            open = true;
            active = 0;
        }}
        onfocus={() => (open = true)}
        onblur={() => setTimeout(() => (open = false), 150)}
        {onkeydown}
        placeholder="Type a pair: eth, btc/usd, SOLUSDT…   /"
        spellcheck="false"
        autocomplete="off"
        aria-label="Search pairs"
    />
    {#if open && query}
        <ul class="results">
            {#each results as pair, i (pair.symbol)}
                <li>
                    <button class:active={i === active} onmousedown={() => go(pair.symbol)} onmouseenter={() => (active = i)}>
                        <strong>{pair.base}</strong><span class="muted">/{pair.quote}</span>
                        {#if pair.status !== "TRADING"}<span class="badge">{pair.status}</span>{/if}
                    </button>
                </li>
            {:else}
                <li class="empty muted">
                    {pairs.loaded ? `No ${pairs.exchange} pair matches “${query}”` : "Loading pairs…"}
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .search {
        position: relative;
        flex: 0 1 380px;
    }

    input {
        width: 100%;
        padding: 6px 10px;
        background: var(--bg);
        color: var(--text);
        border: 1px solid var(--line);
        border-radius: 4px;
        font: inherit;
    }

    input:focus {
        outline: none;
        border-color: var(--accent);
    }

    .results {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        margin: 0;
        padding: 4px;
        list-style: none;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 4px;
        box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
    }

    .results button {
        display: flex;
        gap: 2px;
        align-items: baseline;
        width: 100%;
        text-align: left;
        border: 1px solid transparent;
        background: none;
        padding: 4px 8px;
        font-size: 14px;
    }

    .results button.active {
        background: #23262d;
        border-color: var(--line);
        color: var(--text);
    }

    .badge {
        margin-left: auto;
        font-size: 11px;
        color: var(--warn);
    }

    .empty {
        padding: 4px 8px;
    }
</style>
