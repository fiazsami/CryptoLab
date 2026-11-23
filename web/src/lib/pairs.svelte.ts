import type { PairInfo } from "../../../shared/protocol.ts";
import { normalizeSymbol } from "../../../shared/symbols.ts";

/** The exchange's pair list, fetched once per page load. */
class Pairs {
    list = $state.raw<PairInfo[]>([]);
    exchange = $state("");
    loaded = $state(false);
    error = $state<string | null>(null);

    private bySymbol = $derived(new Map(this.list.map((p) => [p.symbol, p])));
    private loading: Promise<void> | null = null;

    load(): Promise<void> {
        this.loading ??= fetch("/api/pairs")
            .then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const body = (await response.json()) as { exchange: string; pairs: PairInfo[] };
                this.list = body.pairs;
                this.exchange = body.exchange;
                this.loaded = true;
                this.error = null;
            })
            .catch((error: unknown) => {
                this.error = error instanceof Error ? error.message : String(error);
                this.loading = null;
            });
        return this.loading;
    }

    get(symbol: string): PairInfo | undefined {
        return this.bySymbol.get(normalizeSymbol(symbol));
    }
}

export const pairs = new Pairs();
