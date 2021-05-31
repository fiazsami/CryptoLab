const COLORS_LEVEL2 = [
  "#ffedd8",
  "#f3d5b5",
  "#e7bc91",
  "#d4a276",
  "#bc8a5f",
  "#a47148",
  "#8b5e34",
  "#6f4518",
  "#603808",
  "#583101",
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
