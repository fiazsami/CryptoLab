document.onkeydown = (event) => {
  if (event.key === "q") {
    SHOW_PRICES = !SHOW_PRICES;
  } else if (event.key === "s") {
    DEPTH_EFFECT = !DEPTH_EFFECT;
  } else {
    if (event.key === "ArrowDown") {
      PRECISION += 1;
      SPREAD_THRESHOLD = precisionTenth();
      RETRACE_THRESHOLD = SPREAD_THRESHOLD;
    } else if (event.key === "ArrowUp") {
      PRECISION -= 1;
      SPREAD_THRESHOLD = precisionTenth();
      RETRACE_THRESHOLD = SPREAD_THRESHOLD;
    } else if (event.key === "r") {
      SPREAD_THRESHOLD = precisionTenth();
    } else if (event.key === "ArrowLeft") {
      RETRACE_THRESHOLD = precisionDecrement(RETRACE_THRESHOLD);
    } else if (event.key === "ArrowRight") {
      RETRACE_THRESHOLD = precisionIncrement(RETRACE_THRESHOLD);
    }
  }
};
