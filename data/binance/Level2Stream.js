const StreamClient = require("./StreamClient");
const TimeFn = require("../util/TimeFn");

const CHANNEL = "depth20@100ms";
const URL_US = "wss://stream.binance.us:9443/stream?streams=";
const URL_COM = "wss://stream.binance.com/stream?streams=";

class Level2Stream {
  constructor(pairs, callback) {
    this.url = StreamClient.toUrl(URL_COM, CHANNEL, pairs);
    this.streamClient = new StreamClient(this.url, (msg) => {
      msg.stream = msg.stream.split("@")[0];
      callback(msg);
    });
  }
}

module.exports = Level2Stream;
