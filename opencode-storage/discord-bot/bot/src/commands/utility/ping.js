const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config");
const { infoEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency and API response time"),

  async execute(interaction) {
    const sent = await interaction.reply({ content: "🏓 Pinging...", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply({
      embeds: [
        infoEmbed("🏓 Pong!", `🤖 **Bot Latency:** ${latency}ms\n🔌 **API Latency:** ${interaction.client.ws.ping}ms\n✅ **Status:** Online`)
      ],
    });
  },
};