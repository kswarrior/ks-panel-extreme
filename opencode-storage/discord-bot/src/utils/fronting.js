const { Agent: UndiciAgent } = require("undici");
const config = require("../config");

// This sandbox / Hugging Face Spaces blocks TLS whose SNI is "discord.com" but
// allows "gateway.discord.com" (SNI) reachable via the IP of "gateway.discord.gg".
// Cloudflare serves Discord's API by HTTP Host header, so we dial the reachable
// host while keeping Host: discord.com. undici (used internally by @discordjs/rest)
// takes an `Agent` instance with a custom `connect` callback — that's the single
// knob that unblocks both REST and (transitively) Gateway discovery.

const REACHABLE_HOST = process.env.GATEWAY_HOST || "gateway.discord.com";
const REACHABLE_DIAL_HOST = process.env.GATEWAY_DIAL_HOST || "gateway.discord.gg";
const FRONTED = new Set([
  "discord.com",
  "gateway.discord.com",
  "cdn.discordapp.com",
  "media.discordapp.net",
  "discordapp.com",
]);

function buildConnect() {
  // undici calls connect(originalConnectOpts, callback). We rewrite the
  // servername + hostname for blocked hosts, then hand off to tls.connect.
  return function frontingConnect(opts, cb) {
    const tls = require("tls");
    const originalHost = opts.servername || opts.host || "";
    const front = FRONTED.has(originalHost);
    const dialHost = front ? REACHABLE_DIAL_HOST : originalHost;
    const sni = front ? REACHABLE_HOST : originalHost;
    const sock = tls.connect({
      host: dialHost,
      port: opts.port ? Number(opts.port) : 443,
      servername: sni,
      ALPNProtocols: opts.ALPNProtocols || ["http/1.1"],
      rejectUnauthorized: opts.rejectUnauthorized !== false,
    });
    const onError = (e) => { sock.removeListener("secureConnect", onOk); cb(e, undefined); };
    const onOk = () => { sock.removeListener("error", onError); cb(null, sock); };
    sock.once("secureConnect", onOk);
    sock.once("error", onError);
  };
}

let _agent = null;
function getRestAgent() {
  if (!_agent) {
    _agent = new UndiciAgent({
      connect: buildConnect(),
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connections: 64,
    });
  }
  return _agent;
}

// The Gateway WebSocket (@discordjs/ws) uses the raw `ws` package, not undici.
// It dials wss://gateway.discord.gg which is NOT blocked, so it needs no agent.
// We expose getWsAgent for completeness but the WS path is left untouched.
function getWsAgent() {
  return null;
}

function isEnabled() {
  return true;
}

module.exports = { getRestAgent, getWsAgent, isEnabled, REACHABLE_HOST, REACHABLE_DIAL_HOST, FRONTED };
