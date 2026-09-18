const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config");
const { buildCard } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Show information about the bot"),

  async execute(interaction, client) {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const memory = process.memoryUsage();

    const card = buildCard({
      title: `${config.botName} Info`,
      description: `Owned by **${config.ownerName}** (@${config.ownerDiscord})`,
      theme: "info",
      thumbnail: client.user.displayAvatarURL({ dynamic: true, size: 256 }),
      // Use vertical field list to avoid long values on a single line.
      grid: false,
      fields: [
        { name: "Bot Name", value: client.user.tag },
        { name: "Bot ID", value: client.user.id },
        { name: "Owner", value: config.ownerName },
        { name: "Servers", value: `${client.guilds.cache.size}` },
        { name: "Users", value: `${client.users.cache.size}` },
        { name: "Channels", value: `${client.channels.cache.size}` },
        { name: "Commands", value: `${client.commands.size}` },
        { name: "Ping", value: `${client.ws.ping}ms` },
        { name: "Memory", value: `${Math.round(memory.heapUsed / 1024 / 1024)}MB` },
        { name: "Uptime", value: `${days}d ${hours}h ${minutes}m ${seconds}s` },
        { name: "Node.js", value: process.version },
        { name: "Discord.js", value: "14.x (V2)" },
      ],
    });

    await interaction.reply({ embeds: [card] });
  },
};