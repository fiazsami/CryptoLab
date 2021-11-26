class TradeBook {
    constructor() {
        this.reset();
        this.maxPrice = -99999999;
        this.minPrice = 99999999;
    }

    reset() {
        this.buys = {};
        this.sells = {};

        this.total = {};
    }

    update(side, price, volume) {
        if (price < this.minPrice) {
            this.minPrice = price;
        }

        if (price > this.maxPrice) {
            this.maxPrice = price;
        }

        let traded = this.total[price] ? this.total[price] : 0;
        this.total[price] = traded + volume;

        let sideTraded = side[price] ? side[price] : 0;
        side[price] = sideTraded + volume;
    }

    hit(price, volume) {
        this.update(this.buys, price, volume);
    }

    take(price, volume) {
        this.update(this.sells, price, volume);
    }

    totalAt(price) {
        return this.total[price] ? this.total[price] : 0;
    }

    boughtAt(price) {
        return this.buys[price] ? this.buys[price] : 0;
    }

    soldAt(price) {
        return this.sells[price] ? this.sells[price] : 0;
    }

    bidDelta(price) {
        let bidVol = this.buys[price] ? this.buys[price] : 0;
        let askVol = this.sells[price] ? this.sells[price] : 0;
        if (bidVol > askVol) {
            return bidVol - askVol;
        }
        return "";
    }

    askDelta(price) {
        let bidVol = this.buys[price] ? this.buys[price] : 0;
        let askVol = this.sells[price] ? this.sells[price] : 0;
        if (bidVol < askVol) {
            return askVol - askVol;
        }
        return "";
    }
}
