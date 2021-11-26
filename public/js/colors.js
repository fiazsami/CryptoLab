const COLORS_LEVEL2 = [
    "#ADE8F4",
    "#90E0EF",
    "#6CD5EA",
    "#48CAE4",
    "#00B4D8",
    "#0096C7",
    "#0077B6",
    "#015BA0",
    "#023E8A",
    "#03045E",
];

const COLORS_VOLUME = [
    "#012a4a",
    "#013a63",
    "#01497c",
    "#014f86",
    "#2a6f97",
    "#2c7da0",
    "#468faf",
    "#61a5c2",
    "#89c2d9",
    "#a9d6e5",
];

function textColorLevel2(price) {
    return Number(price[price.length - 1]) < 5 ? "#000000" : "#ffffff";
}

function textColorVolume(price) {
    return Number(price[price.length - 1]) < 8 ? "#ffffff" : "#000000";
}

function backgroundColor(colors, index) {
    return colors[Number(index)];
}

function colorIndex(data) {
    let d = data.replace(".", "");
    return d[d.length - 1];
}
