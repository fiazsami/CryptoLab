var express = require("express");
var router = express.Router();

router.get("/", function (req, res, next) {
  res.render("level2", { title: "Level2" });
});

router.get("/volume", function (req, res, next) {
  res.render("volume", { title: "Volume" });
});

module.exports = router;
