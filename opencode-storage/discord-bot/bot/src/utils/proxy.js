const config = require("../config");

let _wsAgent = null;
let _restAgent = null;

function makeAgent(url) {
  if (!url) return null;
  try {
    if (url.startsWith("socks")) {
      const { SocksProxyAgent } = require("socks-proxy-agent");
      return new SocksProxyAgent(url);
    }
    const { HttpsProxyAgent } = require("https-proxy-agent");
    return new HttpsProxyAgent(url);
  } catch (e) {
    console.warn(`[PROXY] Failed to build agent from "${url}": ${e.message}`);
    return null;
  }
}

function getWsAgent() {
  if (!_wsAgent) _wsAgent = makeAgent(config.proxyUrl);
  return _wsAgent;
}

function getRestAgent() {
  if (!_restAgent) _restAgent = makeAgent(config.proxyRestUrl || config.proxyUrl);
  return _restAgent;
}

function isProxyConfigured() {
  return Boolean(config.proxyUrl || config.proxyRestUrl);
}

function status() {
  if (!isProxyConfigured()) return "disabled (direct connection)";
  return `enabled  ws=${config.proxyUrl || "(none)"}  rest=${config.proxyRestUrl || config.proxyUrl || "(none)"}`;
}

module.exports = { getWsAgent, getRestAgent, isProxyConfigured, status };
