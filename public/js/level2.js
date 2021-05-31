const LEVEL2 = document.getElementById("level2");
// const socket = io();

function getRowLevel2(index) {
  return {
    bidQuoteVol: document.getElementById(`bQV${index}`),
    bidTradeVol: document.getElementById(`bTV${index}`),
    bidPrice: document.getElementById(`bP${index}`),
    askQuoteVol: document.getElementById(`aQV${index}`),
    askTradeVol: document.getElementById(`aTV${index}`),
    askPrice: document.getElementById(`aP${index}`),
    spread: document.getElementById(`s${index}`),
  };
}

const LEVEL2_CELLS = [
  getRowLevel2(0),
  getRowLevel2(1),
  getRowLevel2(2),
  getRowLevel2(3),
  getRowLevel2(4),
  getRowLevel2(5),
  getRowLevel2(6),
  getRowLevel2(7),
  getRowLevel2(8),
  getRowLevel2(9),
  getRowLevel2(10),
  getRowLevel2(11),
  getRowLevel2(12),
  getRowLevel2(13),
  getRowLevel2(14),
  getRowLevel2(15),
  getRowLevel2(16),
  getRowLevel2(17),
  getRowLevel2(18),
  getRowLevel2(19),
];

socket.on("level2", (level2) => {
  for (let i = 0; i < LEVEL2_CELLS.length; i++) {
    updateLevel2(i, level2.data);
  }
});

const DISPLAY = document.getElementById("display");

function updateTrade(trade) {
  if (trade.action > 0) {
    TRADE_BOOK.take(toAsk(trade.price), trade.volume);
  } else {
    TRADE_BOOK.hit(toBid(trade.price), trade.volume);
  }
}

function updateLevel2(index, data) {
  let row = LEVEL2_CELLS[index];
  let bidPrice = toBid(data.bids[index][0]);
  let askPrice = toAsk(data.asks[index][0]);
  let spread = toSpread(askPrice - bidPrice);

  row.spread.textContent = spread;

  row.bidPrice.textContent = bidPrice;
  row.askPrice.textContent = askPrice;

  if (index === 0) {
    row.bidTradeVol.textContent = toVolume(TRADE_BOOK.boughtAt(bidPrice));
    row.askTradeVol.textContent = toVolume(TRADE_BOOK.soldAt(askPrice));
  } else {
    let pBid = toBid(data.bids[index - 1][0]);
    let pAsk = toAsk(data.asks[index - 1][0]);
    if (pBid !== bidPrice) {
      row.bidTradeVol.textContent = toVolume(TRADE_BOOK.boughtAt(bidPrice));
    } else {
      row.bidTradeVol.textContent = "";
    }
    if (pAsk !== askPrice) {
      row.askTradeVol.textContent = toVolume(TRADE_BOOK.soldAt(askPrice));
    } else {
      row.askTradeVol.textContent = "";
    }
  }

  let bidColor = colorIndex(bidPrice);
  let askColor = colorIndex(askPrice);
  let spreadColor = colorIndex(spread);

  row.bidPrice.style.backgroundColor = backgroundColor(COLORS_LEVEL2, bidColor);
  row.bidPrice.style.color = textColorLevel2(bidColor);

  row.askPrice.style.backgroundColor = backgroundColor(COLORS_LEVEL2, askColor);
  row.askPrice.style.color = textColorLevel2(askColor);

  row.spread.style.backgroundColor = backgroundColor(
    COLORS_LEVEL2,
    spreadColor
  );
  row.spread.style.color = textColorLevel2(spreadColor);
}
