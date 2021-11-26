let PRECISION = 5;

document.onkeydown = (event) => {
    if (event.key === "q") {
        SHOW_PRICES = !SHOW_PRICES;
    } else {
        if (event.key === "ArrowDown") {
            PRECISION += 1;
        } else if (event.key === "ArrowUp") {
            PRECISION -= 1;
        }

        console.log(PRECISION);
    }
};
