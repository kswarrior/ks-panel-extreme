require("dotenv").config();

let token = (process.env.TOKEN || "").trim();
// Remove accidental quotes or whitespace
if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) token = token.slice(1,-1).trim();
// Strip wrapper K...S: .env stores TOKEN=K<real>S to obfuscate; runtime removes outer K/S
// e.g. TOKEN=KMTUyMTc3Mzk0MjQ2Mzc5MTE1NA.G_Vh4O.IrXeIZWcCtOMTmOz5uidD_xoqaaETZd0mnCp30S -> real token without K/S
if (token.length >= 2 && token.startsWith("K") && token.endsWith("S")) {
  token = token.slice(1, -1).trim();
  // re-strip quotes if wrapped inside
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) token = token.slice(1,-1).trim();
}
if (!token) {
  console.error("[FATAL] TOKEN is not set in .env. Please fill in your bot token and restart.");
  console.error("[HINT] Edit bot/.env → TOKEN=your_new_token (from https://discord.com/developers/applications )");
  process.exit(1);
}
if (token.split('.').length !== 3) {
  console.warn("[WARN] TOKEN doesn't look like a Discord bot token (should be 3 parts separated by dots). Check bot/.env");
}

module.exports = {
  token,
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",
  ownerId: process.env.OWNER_ID || "",
  proxyUrl: process.env.PROXY_URL || "",
  proxyRestUrl: process.env.PROXY_REST_URL || "",
  ownerName: "KS Warrior",
  ownerDiscord: "ks_warrior_pro",
  botName: "KS Bot",
  prefix: "/",
  colors: {
    primary: 0x5865f2,
    success: 0x57f287,
    warning: 0xfee75c,
    error: 0xed4245,
    info: 0x5865f2,
    embed: 0x2b2d31,
  },
  emojis: {
    success: "<a:yes:1082312262786691124>",
    error: "<a:no:1082312263970009138>",
    warning: "<a:warn:1082312265141854258>",
    loading: "<a:loading:1082312266360168460>",
    ticket: "🎫",
    giveaway: "🎉",
    poll: "📊",
    mod: "🛡️",
    fun: "🎮",
    info: "ℹ️",
    lock: "🔒",
    unlock: "🔓",
  },
  ticketCategory: "Tickets",
  iconURL: "https://i.imgur.com/8fK0fFz.png",
  modLogChannel: "mod-logs",
  welcomeChannel: "welcome",
  goodbyeChannel: "goodbye",
  memberRole: "Member",
  muteRole: "Muted",
};
