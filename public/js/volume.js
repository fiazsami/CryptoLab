PRECISION = 2;

function getRowVolume(index) {
    return {
        price: document.getElementById(`price${index}`),
        bidVol: document.getElementById(`bVol${index}`),
        askVol: document.getElementById(`aVol${index}`),
    };
}

const VOLUME_CELLS = [
    getRowVolume(0),
    getRowVolume(1),
    getRowVolume(2),
    getRowVolume(3),
    getRowVolume(4),
    getRowVolume(5),
    getRowVolume(6),
    getRowVolume(7),
    getRowVolume(8),
    getRowVolume(9),
    getRowVolume(10),
    getRowVolume(11),
    getRowVolume(12),
    getRowVolume(13),
    getRowVolume(14),
    getRowVolume(15),
    getRowVolume(16),
    getRowVolume(17),
    getRowVolume(18),
    getRowVolume(19),
];

function bookVolume(volume) {
    return Math.ceil(Number(volume));
}

function updateVolume(trade) {
    if (trade.action > 0) {
        TRADE_BOOK.take(toAsk(trade.price), trade.volume);
    } else {
        TRADE_BOOK.hit(toBid(trade.price), trade.volume);
    }

    let start = Number(toBid(trade.price - 10 * Number(precisionTenth())));
    let i = 0;
    let prices = [];
    while (prices.length < 20) {
        let price = toBid(start + i * Number(precisionTenth()));
        if (!prices.includes(price)) {
            prices.push(price);
        }
        i++;
    }

    for (let i = 0; i < prices.length; i++) {
        let price = prices[i];
        let cell = VOLUME_CELLS[19 - i];
        cell.price.textContent = price;

        let bidVol = bookVolume(TRADE_BOOK.boughtAt(price));
        let askVol = bookVolume(TRADE_BOOK.soldAt(price));
        let imbalance = askVol - bidVol;
        cell.bidVol.textContent = "";
        cell.askVol.textContent = "";

        if (imbalance < 0) {
            cell.bidVol.textContent = Math.abs(imbalance);
        } else if (imbalance > 0) {
            cell.askVol.textContent = imbalance;
        }

        let colorIndex = cell.price.textContent[2];
        cell.price.style.backgroundColor = backgroundColor(
            COLORS_VOLUME,
            colorIndex
        );
        cell.price.style.color = textColorVolume(colorIndex);
    }
}
