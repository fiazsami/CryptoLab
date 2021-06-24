var express = require("express");
var router = express.Router();

router.get("/:ticker", function (req, res, next) {
    res.render("level2", { title: "Level2", ticker: req.params.ticker });
});

router.get("/volume", function (req, res, next) {
    res.render("volume", { title: "Volume" });
});

module.exports = router;
