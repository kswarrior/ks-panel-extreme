const { Client, GatewayIntentBits, Collection, Partials } = require("discord.js");
const config = require("./src/config");
const { loadEvents } = require("./src/handlers/eventHandler");
const { loadCommands, registerCommands } = require("./src/handlers/commandHandler");
const { getRestAgent: getFrontingRestAgent, getWsAgent: getFrontingWsAgent, REACHABLE_HOST, FRONTED, REACHABLE_DIAL_HOST } = require("./src/utils/fronting");

const INTENTS = {
  Guilds: GatewayIntentBits.Guilds,
  GuildMembers: GatewayIntentBits.GuildMembers,
  GuildMessages: GatewayIntentBits.GuildMessages,
  MessageContent: GatewayIntentBits.MessageContent,
  GuildModeration: GatewayIntentBits.GuildModeration,
  GuildMessageReactions: GatewayIntentBits.GuildMessageReactions,
  GuildVoiceStates: GatewayIntentBits.GuildVoiceStates,
  GuildPresences: GatewayIntentBits.GuildPresences,
  GuildInvites: GatewayIntentBits.GuildInvites,
};

const PRIVILEGED_INTENTS = ["MessageContent", "GuildMembers", "GuildPresences"];
const NON_PRIVILEGED = Object.entries(INTENTS)
  .filter(([k]) => !PRIVILEGED_INTENTS.includes(k))
  .map(([, v]) => v);

// Network strategy (Hugging Face Spaces blocks SNI "discord.com"):
//   1) If PROXY_URL / PROXY_REST_URL is set -> route REST through that proxy.
//   2) Otherwise -> use the SNI-fronting Agent from utils/fronting.js, which
//      dials gateway.discord.gg with servername gateway.discord.com. This works
//      with NO proxy env vars set, so editing .env / rebuilding won't break it.
// The Gateway WebSocket dials gateway.discord.gg directly (not blocked), so it
// needs no agent.
const proxyConfig = config.proxyUrl || config.proxyRestUrl;
let restAgent;
if (proxyConfig) {
  try {
    const { ProxyAgent } = require("undici");
    restAgent = new ProxyAgent(proxyConfig);
    console.log(`[REST] Using external proxy: ${proxyConfig.replace(/\/\/.*@/, "//***@")}`);
  } catch (e) {
    console.warn("[REST] ProxyAgent unavailable, falling back to SNI fronting:", e.message);
    restAgent = getFrontingRestAgent();
  }
} else {
  restAgent = getFrontingRestAgent();
  console.log(`[FRONTING] REST host "${REACHABLE_HOST}" (dial ${REACHABLE_DIAL_HOST}) -> unblocks discord.com.`);
}

const client = new Client({
  intents: [...NON_PRIVILEGED, ...PRIVILEGED_INTENTS.map((k) => INTENTS[k])],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember],
  rest: { agent: restAgent },
});


// Modern Components V2 styling across the whole bot. The helpers in
// utils/embed.js return V2 `ContainerBuilder`s (colored card with header /
// separator / body / footer). v2transport upgrades any legacy
// `embeds:[container]` payload on the fly into `flags:IsComponentsV2` +
// `components:[container]`, so every existing command auto-upgrades without
// per-file edits. See src/utils/embed.js and src/utils/v2transport.js.
require("./src/utils/v2transport").patchDiscordSenders();

client.buttonHandlers = new Collection();
client.selectMenuHandlers = new Collection();
client.modalHandlers = new Collection();
client.giveaways = new Map();
client.guildConfig = new Map();
client.ticketConfig = new Map();
client.warnings = new Map();
client.snipeMap = new Map();

async function ensurePrivilegedIntents() {
  console.log("\n[CHECK] Verifying privileged Gateway Intents...");
  for (const name of PRIVILEGED_INTENTS) {
    console.log(`  [INTENT] ${name} - REQUIRED`);
  }
  console.log("\n  If the bot fails with 'Used disallowed intents', go to:");
  console.log("  Discord Developer Portal > Your Bot > Settings > Bot");
  console.log("  Scroll to 'Privileged Gateway Intents' and ENABLE all 3:\n");
  console.log("    1. Presence Intent");
  console.log("    2. Server Members Intent");
  console.log("    3. Message Content Intent\n");
  console.log("  Then restart the bot.\n");
}

async function start() {
  console.log("\n");
  console.log("   ██╗  ██╗███████╗    ██████╗  ██████╗ ████████╗");
  console.log("   ██║ ██╔╝██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝");
  console.log("   █████╔╝ ███████╗    ██████╔╝██║   ██║   ██║   ");
  console.log("   ██╔═██╗ ╚════██║    ██╔══██╗██║   ██║   ██║   ");
  console.log("   ██║  ██╗███████║    ██████╔╝╚██████╔╝   ██║   ");
  console.log("   ╚═╝  ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   ");
  console.log("\n");
  console.log("   Owner: KS Warrior (@ks_warrior_pro)");
  console.log("   Discord Server: KS Hub");
  console.log("\n");

  try {
    const commandsData = await loadCommands(client);
    console.log(`[CMD]   Loaded ${commandsData.length} commands`);
    await registerCommands(commandsData);
    await loadEvents(client);
    await ensurePrivilegedIntents();

    console.log("[LOGIN] Connecting to Discord Gateway...\n");
    await client.login(config.token);
    console.log("\n[OK]    Bot authenticated successfully!");
  } catch (error) {
    if (error.message?.includes("Used disallowed intents")) {
      console.error("\n[ERROR] Privileged Intents are NOT enabled!");
      await ensurePrivilegedIntents();

      console.log("\n[INFO]  Trying again with non-privileged intents only...\n");
      client.options.intents = NON_PRIVILEGED;
      try {
        await client.login(config.token);
        console.log("\n[OK]    Bot running with basic intents.");
        console.log("       Some features (member tracking, message content reading) may be limited.\n");
      } catch (e) {
        console.error("\n[FATAL] Bot failed:", e.message || e);
        process.exit(1);
      }
    } else {
      console.error("\n[FATAL] Failed to start:", error.message || error, "\n");
      process.exit(1);
    }
  }
}

start();

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});