# CryptoLab

A live market viewer for Binance.US. You can browse every pair, type any one, and watch its book, trades, flow and candles update in real time.

```bash
npm install
npm run dev        # http://127.0.0.1:3000
```

That one command starts everything: the Binance.US connection, the hub that shares it between tabs, the JSON API, and the viewer (with hot reload). There's no Docker, no database and no API key. Needs Node 24+.

## Pages

| Path | What it shows |
|---|---|
| `/` | Every trading pair, live. Tabs per quote asset, filter, sort by last / 24h % / volume. *Show halted* includes pairs whose status isn't `TRADING`. |
| `/pair/:symbol` | One pair: quote header, order book, 1m candles, trade imbalance, trade tape. `eth-usdt`, `ETH/USDT` and `ethusdt` all work and become `/pair/ETHUSDT`. |

The search box in the header (press `/`) works on every page. It ranks exact symbol, then exact base (`eth` → ETH/USD, ETH/USDT, …), then prefixes, then substrings. Pressing Enter on something that isn't listed shows a clear "not listed on Binance.US" page.

**Order book.** The legacy level-2 layout: row *i* is the *i*-th bid beside the *i*-th ask, with their spread between them. Price cells take the original blue ramp, picked by the price's last digit. `↑` groups coarser and `↓` finer, the same direction as the old `userEvents.js`. Grouping merges levels: bids round down and asks round up, so a grouped price never claims liquidity nearer the touch than it really is. *Traded* is volume that crossed at that price since the page opened.

**Imbalance.** The port of the old `volume` page. Twenty price buckets around the last trade, with sell-aggressor volume on the left and buy-aggressor volume on the right, accumulated since the page opened (`reset` clears it). The aggressor comes from Binance's `m` flag, not from comparing the trade price with the book.

**Candles.** 500 minutes of 1m history, then live updates. Times are UTC.

## Commands

```bash
npm run dev        # development: Vite middleware + hot reload, restarts on server/ or shared/ changes
npm start          # production: builds web/ into dist/client and serves it
npm test           # unit tests (vitest): no network
npm run smoke      # end to end against live Binance.US: boots the server, streams BTCUSDT
npm run check      # tsc + svelte-check + eslint
```

Environment: `PORT` (3000), `HOST` (127.0.0.1, which keeps it off your LAN), `BINANCE_REST_URL`, `BINANCE_WS_URL`.

## How it fits together

```
Binance.US ──one WebSocket──▶ BinanceUpstream ──▶ BinanceSource ──▶ Hub ──/ws──▶ browser tabs
   REST ◀── exchangeInfo, 24h tickers, klines ──┘                   │
                                                  /api/pairs, /api/klines, /api/health
```

- **`server/sources/binance/upstream.ts`** holds one combined-stream connection. Callers say which streams they *want*, and it works toward that set with SUBSCRIBE/UNSUBSCRIBE, spaced to stay under Binance's 5 messages/second. After a reconnect nothing is live, so everything wanted is simply sent again. It also replies to pings, recycles before Binance's 24h cutoff, and drops a connection that goes silent for 30s. **This is the file to understand if streaming ever stops.**
- **`server/hub.ts`** counts viewers per symbol. The first viewer starts the upstream streams. When the last one leaves, they stay up for 30s, so a reload or a quick back-and-forth doesn't churn subscriptions. A new tab gets the cached book, quote, candle and recent trades immediately.
- **`shared/price.ts`** does all price math as BigInt at 18 decimal places. No float rounding touches a displayed price.
- **`server/sources/types.ts`** is the exchange seam. A second exchange is a new `MarketSource`, not a hub change.

`GET /api/health` shows the upstream state, connected tabs, viewers per symbol, symbols in their grace period, and every upstream stream. Use it first when something looks wrong.

## Layout

```
server/   main.ts (entry) · app.ts (HTTP + /ws + Vite) · hub.ts · http.ts · static.ts · sources/
shared/   protocol.ts (wire types) · price.ts · symbols.ts. Used by both server and browser.
web/      Svelte 5 app: views/ (Markets, Pair), components/ (one per panel), lib/
test/     unit tests
scripts/  smoke.ts
docs/     DECISIONS.md
```

## Limits worth knowing

- Binance.com is geo-blocked from the US (HTTP 451), so this targets Binance.US: 265 trading pairs as of 2026-11-23.
- Imbalance and *Traded* columns start empty on every page load. Nothing is recorded.
- Market data is Binance.US's. This is a personal research tool and isn't meant to be hosted or redistributed.
