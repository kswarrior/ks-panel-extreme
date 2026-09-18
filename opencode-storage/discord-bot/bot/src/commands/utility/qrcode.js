const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("qr")
    .setDescription("Generate a QR code")
    .addStringOption((o) =>
      o.setName("text").setDescription("Text or URL to encode").setRequired(true)
    ),

  async execute(interaction) {
    const text = interaction.options.getString("text");
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;

    const embed = new EmbedBuilder()
      .setTitle("📱 QR Code Generated")
      .setImage(qrUrl)
      .setDescription(`**Content:** ${text.substring(0, 100)}`)
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | QR Code Generator` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};