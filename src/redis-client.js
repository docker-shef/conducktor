const redis = require("redis");
const {promisify} = require("util");
const { log } = require("../config/config.js");

const client = redis.createClient({
    host: global.gConfig.REDIS_HOST,
    port: global.gConfig.REDIS_PORT,
});
client.on("ready", function () {
    log.debug("Redis ready");
}).on("error", function (err) {
    log.fatal("Something wrong with Redis connection!", err);
});

module.exports = {
  ...client,
  getAsync: promisify(client.get).bind(client),
  setAsync: promisify(client.set).bind(client),
  delAsync: promisify(client.del).bind(client),
  keysAsync: promisify(client.keys).bind(client),
  onAsync: promisify(client.on).bind(client),
};