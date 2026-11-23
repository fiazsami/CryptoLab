import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStatic } from "../server/static.ts";

const root = path.resolve("/srv/client");

describe("resolveStatic", () => {
    it("maps paths inside the root", () => {
        expect(resolveStatic(root, "/assets/index-abc.js")).toBe(path.join(root, "assets/index-abc.js"));
        expect(resolveStatic(root, "/")).toBe(root);
        expect(resolveStatic(root, "/pair/ETHUSDT")).toBe(path.join(root, "pair/ETHUSDT"));
    });

    it.each(["/../etc/passwd", "/%2e%2e/etc/passwd", "/assets/../../etc/passwd", "/..%2f..%2fetc/passwd"])(
        "keeps %s inside the root",
        (attempt) => {
            const resolved = resolveStatic(root, attempt);
            expect(resolved === null || resolved === root || resolved.startsWith(root + path.sep)).toBe(true);
        },
    );

    it("rejects malformed escapes and null bytes", () => {
        expect(resolveStatic(root, "/%E0%A4%A")).toBeNull();
        expect(resolveStatic(root, "/a%00.js")).toBeNull();
    });
});
