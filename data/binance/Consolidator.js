const socket = require("socket.io-client")("http://localhost:3000");

const TradeStream = require("./TradeStream");
const Level2Stream = require("./Level2Stream");

socket.on("connect", () => {
    console.log("STREAM CONNECTED");
});

class Consolidator {
    constructor(pairs) {
        this.books = {};

        this.level2 = new Level2Stream(pairs, (quote) => {
            this.books[quote.stream] = quote;
            socket.emit("event", {
                channel: "level2",
                symbol: quote.stream,
                data: quote.data,
            });
        });

        this.trades = new TradeStream(pairs, (trade) => {
            let book = this.books[trade.s];
            if (book) {
                let action = undefined;
                if (this.hitBid(trade, book)) {
                    action = -1;
                } else if (this.takeAsk(trade, book)) {
                    action = 1;
                }
                socket.emit("event", {
                    channel: "trade",
                    symbol: trade.s,
                    action: action,
                    price: trade.p,
                    volume: trade.v,
                });
            }
        });
    }

    hitBid(trade, book) {
        return trade.p <= book.data.bids[0][0];
    }

    takeAsk(trade, book) {
        return trade.p >= book.data.asks[0][0];
    }
}

module.exports = Consolidator;
