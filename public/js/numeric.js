function precisionTenth() {
    return roundPrice(Math.ceil, 1 / Math.pow(10, PRECISION - 1));
}

function precisionDecrement(number) {
    return roundPrice(
        Math.ceil,
        Number(number) - 1 / Math.pow(10, PRECISION - 1)
    );
}

function precisionIncrement(number) {
    return roundPrice(
        Math.ceil,
        Number(number) + 1 / Math.pow(10, PRECISION - 1)
    );
}

function roundPrice(fn, x) {
    let decimals = PRECISION > 0 ? PRECISION - 1 : 0;
    return Number.parseFloat(
        (fn(Math.trunc(x * Math.pow(10, PRECISION)) / 10) * 10) /
            Math.pow(10, PRECISION)
    ).toFixed(decimals);
}

function toBid(price) {
    return roundPrice(Math.floor, price);
}

function toAsk(price) {
    return roundPrice(Math.ceil, price);
}

function toSpread(price) {
    return roundPrice(Math.floor, price);
}

function toBidNumber(price) {
    return Number(roundPrice(Math.floor, price));
}

function toAskNumber(price) {
    return Number(roundPrice(Math.ceil, price));
}

function toSpreadNumber(price) {
    return Number(roundPrice(Math.floor, price));
}

function toVolume(volume) {
    let v = Math.ceil(Number(volume));
    return v > 0 ? v : "";
}
