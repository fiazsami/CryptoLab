import { pairPath, parseRoute, type Route } from "./lib/routes.ts";

/** History routing for two pages. The server falls back to index.html for unknown paths. */
class Router {
    route = $state<Route>(parseRoute(location.pathname));

    constructor() {
        this.canonicalize();
        window.addEventListener("popstate", () => {
            this.route = parseRoute(location.pathname);
        });
    }

    navigate(path: string): void {
        if (path !== location.pathname) history.pushState(null, "", path);
        this.route = parseRoute(path);
        this.canonicalize();
        window.scrollTo(0, 0);
    }

    /** `/pair/eth-usdt` becomes `/pair/ETHUSDT` in the address bar. */
    private canonicalize(): void {
        if (this.route.name !== "pair") return;
        const canonical = pairPath(this.route.symbol);
        if (canonical !== location.pathname) history.replaceState(null, "", canonical);
    }
}

export const router = new Router();

export function navigate(path: string): void {
    router.navigate(path);
}
