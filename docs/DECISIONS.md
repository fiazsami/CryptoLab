# Decisions

Each entry gives what was chosen, what was rejected, and what would change the call.

## 2026-11-23: Modernization (Express/pug/socket.io → TypeScript + Svelte 5)

| Choice | Rejected | Why / what would change it |
|---|---|---|
| One Node process owns HTTP, the `/ws` hub and Vite (middleware mode in dev) | `concurrently` with two processes; a Vite plugin hosting the backend | One command, one port, one log. |
| Server-side hub, one upstream socket, ref-counted SUBSCRIBE/UNSUBSCRIBE, 30s grace | Streaming straight from the browser (the previous HEAD) | The hub validates symbols against `exchangeInfo`, shares one connection across tabs, replays snapshots, and keeps reconnect logic in one place. Browser-direct only wins for a static, serverless deploy. |
| Svelte 5 + Vite, hand-rolled history router | SvelteKit, React | SvelteKit's server would compete with the hub for the HTTP server and upgrades. Two routes don't need a router library. |
| `node:http` + a small route table | Fastify, Hono, Express 5 | Three endpoints. Revisit past ~10. |
| Node's native type stripping (`node --watch-path=server --watch-path=shared server/main.ts`) | `tsx` | One less dependency. Switch to `tsx` if a dependency needs real TS transforms. Watch *paths*, not the import graph: Vite imports a temporary compiled config, which made `node --watch` restart in a loop. |
| Binance.US, URLs env-overridable | Binance.com | Binance.com returns 451 from the US. |
| Prices as strings on the wire, BigInt math at 18 dp | Floats (legacy `numeric.js`), `big.js` | Exact, no dependency. |
| Aggressor from the trade's `m` flag | Comparing the trade price with the book top (legacy `Consolidator`) | `m` is exact. The comparison misclassifies trades inside the spread and races the book. |
| Book grouping merges levels (bids floor, asks ceil) | Depth-paired rows that can repeat a price at coarse precision (legacy) | At the native tick the two are identical. Coarser, merging is what the grouping is for. |
| `MarketSource` interface in front of Binance | Binance wired into the hub | Adding Coinbase/Kraken becomes one adapter. |
| TypeScript pinned `~6.0` | 7.0 (npm `latest`) | typescript-eslint requires `<6.1` and svelte-check `^5 \|\| ^6`. Bump when both support 7. |
| Client closes its socket on `pagehide` (bfcache) and reopens on `pageshow`; server pings every 30s | Relying on TCP close | Observed in Chrome: a page left via navigation stayed in the back/forward cache with its socket open, and the server kept streaming its pair. Pings catch half-open sockets, not cached pages. |
