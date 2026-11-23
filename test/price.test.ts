import { describe, expect, it } from "vitest";
import {
    bucket,
    decimalsFromTick,
    formatPrice,
    formatQty,
    formatUnits,
    percentChange,
    spread,
    toUnits,
} from "../shared/price.ts";

describe("toUnits / formatUnits", () => {
    it("round-trips Binance's 8-decimal strings exactly", () => {
        expect(formatUnits(toUnits("62712.41000000"), 8)).toBe("62712.41000000");
        expect(formatUnits(toUnits("0.00000001"), 8)).toBe("0.00000001");
    });

    it("represents values that floats cannot", () => {
        // 0.1 + 0.2 !== 0.3 in floating point; in units it is exact.
        expect(toUnits("0.1") + toUnits("0.2")).toBe(toUnits("0.3"));
    });

    it("rejects anything that is not a non-negative decimal", () => {
        expect(() => toUnits("-1")).toThrow();
        expect(() => toUnits("1e-8")).toThrow();
        expect(() => toUnits("abc")).toThrow();
    });

    it("formats negative differences with a sign", () => {
        expect(formatUnits(toUnits("1") - toUnits("1.5"), 1)).toBe("-0.5");
    });
});

describe("bucket", () => {
    it("floors bids and ceils asks", () => {
        expect(bucket("62712.41", 1, "floor")).toBe("62712.4");
        expect(bucket("62712.41", 1, "ceil")).toBe("62712.5");
    });

    it("leaves exact boundaries alone in both modes", () => {
        expect(bucket("62712.40", 1, "floor")).toBe("62712.4");
        expect(bucket("62712.40", 1, "ceil")).toBe("62712.4");
    });

    it("handles the legacy float trap 1.005", () => {
        // Math.round(1.005 * 100) / 100 === 1 in floating point.
        expect(bucket("1.005", 2, "ceil")).toBe("1.01");
        expect(bucket("1.005", 2, "floor")).toBe("1.00");
    });

    it("groups coarser than whole units with negative decimals", () => {
        expect(bucket("62712.41", -1, "floor")).toBe("62710");
        expect(bucket("62712.41", -2, "ceil")).toBe("62800");
    });

    it("works at an 8-decimal tick", () => {
        expect(bucket("0.00001234", 8, "floor")).toBe("0.00001234");
        expect(bucket("0.00001234", 6, "ceil")).toBe("0.000013");
    });
});

describe("decimalsFromTick", () => {
    it.each([
        ["0.01000000", 2],
        ["1.00000000", 0],
        ["0.00000001", 8],
        ["0.00500000", 3],
        ["10.00000000", 0],
    ])("%s → %i", (tick, decimals) => {
        expect(decimalsFromTick(tick)).toBe(decimals);
    });
});

describe("display helpers", () => {
    it("formatPrice truncates to the requested digits", () => {
        expect(formatPrice("62712.41000000", 2)).toBe("62712.41");
        expect(formatPrice("62712.41000000", 0)).toBe("62712");
    });

    it("spread is exact", () => {
        expect(spread("62731.67", "62712.41", 2)).toBe("19.26");
    });

    it("formatQty is compact and blank for zero", () => {
        expect(formatQty("0")).toBe("");
        expect(formatQty("0.00019000")).toBe("0.00019");
        expect(formatQty("1.5")).toBe("1.500");
        expect(formatQty("12345.6")).toBe("12.3K");
        expect(formatQty(2_500_000)).toBe("2.50M");
    });

    it("percentChange guards a zero open", () => {
        expect(percentChange("0", "10")).toBeNull();
        expect(percentChange("100", "110")).toBeCloseTo(10);
    });
});
