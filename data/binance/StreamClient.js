const Logger = require("../util/Logger");
const WebSocket = require("ws");

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

        this.socket.on("pong", () => {});
        this.socket.on("ping", () => {
            this.socket.pong();
        });
    }

    heartBeat() {
        setInterval(() => {
            if (this.socket.readyState === WebSocket.OPEN) {
                this.socket.ping();
            }
        }, 5000);
    }
}

module.exports = StreamClient;
