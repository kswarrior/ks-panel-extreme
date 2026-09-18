const { SlashCommandBuilder } = require("discord.js");
const { buildCard } = require("../../utils/embed");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Display information about a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to inspect").setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const fields = [
      { name: "🆔 User ID", value: user.id },
      { name: "🏷️ Username", value: user.username },
      { name: "🤖 Bot", value: user.bot ? "Yes" : "No" },
      { name: "📅 Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>` },
      { name: "📥 Joined Server", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` },
      { name: "🎭 Roles", value: member.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => r.toString()).join(", ") || "None" },
      { name: "🌟 Highest Role", value: member.roles.highest.toString() },
      { name: "🏷️ Nickname", value: member.nickname || "None" },
      { name: "🔊 Voice Channel", value: member.voice.channel ? member.voice.channel.toString() : "Not in voice" },
      { name: "🌍 Locale", value: user.locale || "Not set" },
      { name: "🚩 Banner Color", value: user.bannerColor || "None" },
    ];
    const card = buildCard({
      title: `User Info: ${user.tag}`,
      theme: "info",
      thumbnail: user.displayAvatarURL({ dynamic: true, size: 1024 }),
      // Show each entry on its own line for readability.
      grid: false,
      fields,
    });
    await interaction.reply({ embeds: [card] });
  },
};