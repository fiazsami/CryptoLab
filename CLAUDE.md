# CryptoLab

**Purpose:** personal research tool (not a product for sale). It's a local, single-user live viewer for Binance.US market data. Don't add hosting, auth or multi-user concerns unless asked.

## Commands

```bash
npm run dev      # the whole app, http://127.0.0.1:3000
npm test         # unit tests, no network
npm run smoke    # live end-to-end against Binance.US
npm run check    # tsc + svelte-check (--fail-on-warnings) + eslint
```

Run `npm run check && npm test` after changes. Run `npm run smoke` after anything in `server/`.

## Conventions

- Node 24 runs `server/`, `shared/`, `scripts/` and `test/` as `.ts` directly (type stripping). Use **erasable syntax only**: no enums, namespaces or constructor parameter properties, and include `.ts` in relative imports. `tsconfig.json` enforces this.
- `shared/` is imported by both server and browser. Keep it free of Node and DOM APIs.
- Prices are decimal strings end to end. Do display math with `shared/price.ts`, never `Number(price)` arithmetic.
- Browser state uses Svelte 5 runes. Collections held in state are replaced wholesale (`$state.raw`), not mutated.
- The exchange is behind `server/sources/types.ts` (`MarketSource`). Exchange-specific parsing stays in its adapter.
- Record real design choices in `docs/DECISIONS.md`.
