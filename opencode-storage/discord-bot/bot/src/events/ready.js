const config = require("../config");
const { EmbedBuilder } = require("discord.js");
const guildConfigDB = require("../utils/database/guildconfig");

module.exports = {
  name: "ready",
  once: true,

  async execute(client) {
    console.log(`\n┌────────────────────────────────────────┐`);
    console.log(`│ ✅ ${config.botName} is online!`);
    console.log(`│ 📛 Bot Tag: ${client.user.tag}`);
    console.log(`│ 🆔 Bot ID: ${client.user.id}`);
    console.log(`│ 👑 Owner: ${config.ownerName} (@${config.ownerDiscord})`);
    console.log(`│ 🌐 Servers: ${client.guilds.cache.size}`);
    console.log(`│ 👥 Users: ${client.users.cache.size}`);
    console.log(`└────────────────────────────────────────┘\n`);

    // Restore ticket config from DB into the in-memory map so it survives
    // restarts (avoids "Ticket system is not configured" after a reboot).
    client.ticketConfig = client.ticketConfig || new Map();
    try {
      for (const guild of client.guilds.cache.values()) {
        const t = guildConfigDB.getTicketConfig(guild.id);
        if (t) client.ticketConfig.set(guild.id, t);
      }
      console.log(`[DB] Restored ticket config for ${client.ticketConfig.size} guild(s).`);
    } catch (e) {
      console.warn("[DB] Failed to restore ticket config:", e.message);
    }

    const activities = [
      { name: `KS Hub | /help`, type: 3 },
      { name: `${client.guilds.cache.size} servers`, type: 3 },
      { name: `by ${config.ownerName}`, type: 3 },
      { name: `Protecting KS Hub`, type: 0 },
      { name: `over ${client.users.cache.size} users`, type: 3 },
    ];

    let i = 0;
    setInterval(() => {
      client.user.setPresence({
        activities: [activities[i % activities.length]],
        status: "online",
      });
      i++;
    }, 15000);
  },
};