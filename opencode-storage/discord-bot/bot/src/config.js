require("dotenv").config();

const token = process.env.TOKEN;
if (!token) {
  console.error("[FATAL] TOKEN is not set in .env. Please fill in your bot token and restart.");
  process.exit(1);
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
