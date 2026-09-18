const { SlashCommandBuilder } = require("discord.js");
const { buildCard } = require("../../utils/embed");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Display server information"),

  async execute(interaction) {
    const guild = interaction.guild;
    await guild.members.fetch();
    const fields = [
      { name: "🆔 Server ID", value: guild.id },
      { name: "👑 Owner", value: `<@${guild.ownerId}>` },
      { name: "📅 Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>` },
      { name: "👥 Total Members", value: `${guild.memberCount}` },
      { name: "🤖 Bots", value: `${guild.members.cache.filter((m) => m.user.bot).size}` },
      { name: "🟢 Online", value: `${guild.members.cache.filter((m) => m.presence?.status === "online").size}` },
      { name: "🌙 Idle", value: `${guild.members.cache.filter((m) => m.presence?.status === "idle").size}` },
      { name: "💤 DND", value: `${guild.members.cache.filter((m) => m.presence?.status === "dnd").size}` },
      { name: "📺 Channels", value: `${guild.channels.cache.size}` },
      { name: "🎤 Voice", value: `${guild.channels.cache.filter((c) => c.isVoiceBased()).size}` },
      { name: "💬 Text", value: `${guild.channels.cache.filter((c) => c.isTextBased() && !c.isVoiceBased()).size}` },
      { name: "🎭 Roles", value: `${guild.roles.cache.size}` },
      { name: "😊 Emojis", value: `${guild.emojis.cache.size}` },
      { name: "🚀 Boosts", value: `${guild.premiumSubscriptionCount || 0}` },
      { name: "🛡️ Verification", value: `${guild.verificationLevel}` },
      { name: "📍 Region", value: guild.preferredLocale || "Not set" },
    ];
    const card = buildCard({
      title: `Server Info: ${guild.name}`,
      theme: "info",
      thumbnail: guild.iconURL({ dynamic: true, size: 1024 }),
      // Vertical list keeps IDs and numbers readable.
      grid: false,
      fields,
    });
    await interaction.reply({ embeds: [card] });
  },
};