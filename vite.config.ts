import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The browser app lives in web/. In development the Node server (server/main.ts)
// hosts Vite in middleware mode, so there is no separate dev-server process.
export default defineConfig({
    root: fileURLToPath(new URL("./web", import.meta.url)),
    plugins: [svelte()],
    build: {
        outDir: fileURLToPath(new URL("./dist/client", import.meta.url)),
        emptyOutDir: true,
    },
});
