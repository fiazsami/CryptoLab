import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default defineConfig(
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            // Legacy Express/pug app, superseded by server/ + web/. Pending removal.
            "app.js",
            "bin/**",
            "routes/**",
            "views/**",
            "data/**",
            "public/**",
        ],
    },
    js.configs.recommended,
    tseslint.configs.recommended,
    svelte.configs.recommended,
    {
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },
    {
        files: ["**/*.svelte", "**/*.svelte.ts"],
        languageOptions: {
            parserOptions: { parser: tseslint.parser, extraFileExtensions: [".svelte"] },
        },
    },
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
);
