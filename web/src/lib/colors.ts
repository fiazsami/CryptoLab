/**
 * The legacy colour ramps from `public/js/colors.js`. The last displayed digit
 * of a price picks the shade, so prices that share a digit share a colour and
 * the columns shimmer as the book ticks. The original chose text colour from
 * the digit too, since the lightest shades need dark text.
 */

export const LEVEL2_RAMP = [
    "#ADE8F4", "#90E0EF", "#6CD5EA", "#48CAE4", "#00B4D8",
    "#0096C7", "#0077B6", "#015BA0", "#023E8A", "#03045E",
];

export const VOLUME_RAMP = [
    "#012a4a", "#013a63", "#01497c", "#014f86", "#2a6f97",
    "#2c7da0", "#468faf", "#61a5c2", "#89c2d9", "#a9d6e5",
];

function lastDigit(text: string): number {
    const digits = text.replace(/\D/g, "");
    return Number(digits.at(-1) ?? "0");
}

/** Inline style for a book price or spread cell. */
export function level2Style(text: string): string {
    const d = lastDigit(text);
    return `background:${LEVEL2_RAMP[d]};color:${d < 5 ? "#000" : "#fff"}`;
}

/** Inline style for an imbalance price cell. */
export function volumeStyle(text: string): string {
    const d = lastDigit(text);
    return `background:${VOLUME_RAMP[d]};color:${d < 8 ? "#fff" : "#000"}`;
}
