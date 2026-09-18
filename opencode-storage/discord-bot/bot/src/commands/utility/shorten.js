const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shorten")
    .setDescription("Shorten a URL")
    .addStringOption((o) =>
      o.setName("url").setDescription("URL to shorten").setRequired(true)
    ),

  async execute(interaction) {
    const url = interaction.options.getString("url");

    const embed = new EmbedBuilder()
      .setTitle("🔗 URL Shortener")
      .setDescription(`**Original URL:**\n${url}\n\n*URL shortening service not configured*`)
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName} | URL Shortener` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};