const Logger = {
    debug: (...arg) => {
        console.log(new Date().toISOString(), "DEBUG", ...arg);
    },
    info: (...arg) => {
        console.log(new Date().toISOString(), "INFO", ...arg);
    },
    warn: (...arg) => {
        console.log(new Date().toISOString(), "WARN", ...arg);
    },
};

class StreamClient {
    static toUrl(url, channel, pairs) {
        let path = pairs.map((pair) => `${pair}@${channel}`).join("/");
        return url + path;
    }

    constructor(url, callback) {
        this.url = url;
        this.callback = callback;
        this.handlers = new Map();

        this.socket = new WebSocket(this.url);
        this.socket.onopen = () => {
            Logger.info(`OPENED\n\t${this.url}`);
        };

        this.socket.onclose = () => {
            Logger.warn("CLOSED");
        };

        this.socket.onerror = (error) => {
            Logger.warn(`ERROR\n\t${error}`);
        };

        this.socket.onmessage = (msg) => {
            try {
                this.callback(JSON.parse(msg.data));
            } catch (error) {
                Logger.warn(`ERROR\n\t${error}`);
            }
        };
    }

    heartBeat() {
        setInterval(() => {
            if (this.socket.readyState === WebSocket.OPEN) {
                this.socket.ping();
            }
        }, 5000);
    }
}

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
        this.url = StreamClient.toUrl(URL, "trade", pairs);
        this.streamClient = new StreamClient(this.url, (msg) => {
            callback(parseTrade(msg));
        });
    }
}

const URL_US = "wss://stream.binance.us:9443/stream?streams=";
const URL_COM = "wss://stream.binance.com/stream?streams=";

class Level2Stream {
    constructor(pairs, callback) {
        this.url = StreamClient.toUrl(URL_US, "depth20@100ms", pairs);
        this.streamClient = new StreamClient(this.url, (msg) => {
            msg.stream = msg.stream.split("@")[0];
            callback(msg);
        });
    }
}

class Consolidator {
    constructor(pairs, precision) {
        PRECISION = precision + 1;
        this.books = {};

        this.level2 = new Level2Stream(pairs, (quote) => {
            this.books[quote.stream] = quote;
            for (let i = 0; i < LEVEL2_CELLS.length; i++) {
                updateLevel2(i, quote.data);
            }
        });
    }
}
