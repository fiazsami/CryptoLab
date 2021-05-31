const StreamClient = require("./StreamClient");
const TimeFn = require("../util/TimeFn");

const CHANNEL = "trade";
const URL = "wss://stream.binance.com:9443/ws/";

function parseTrade(trade) {
  let time = TimeFn.roundToSecond(trade.T);
  return {
    s: trade.s.toLowerCase(),
    p: Number(trade.p),
    v: Number(trade.q),
    t: time,
    m: trade.m,
  };
}

class TradeStream {
  constructor(pairs, callback) {
    this.url = StreamClient.toUrl(URL, CHANNEL, pairs);
    this.streamClient = new StreamClient(this.url, (msg) => {
      callback(parseTrade(msg));
    });
  }
}

module.exports = TradeStream;
