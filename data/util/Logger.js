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

module.exports = Logger;
