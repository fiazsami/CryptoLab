import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts, whose root is web/. Tests run in Node against
// pure modules and fakes; nothing here touches the network.
export default defineConfig({
    test: {
        environment: "node",
        include: ["test/**/*.test.ts"],
    },
});
