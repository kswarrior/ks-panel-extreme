const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text to another language")
    .addStringOption((o) =>
      o.setName("text").setDescription("Text to translate").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("to").setDescription("Target language code (e.g., es, fr, de)").setRequired(true)
    ),

  async execute(interaction) {
    const text = interaction.options.getString("text");
    const targetLang = interaction.options.getString("to");

    const embed = new EmbedBuilder()
      .setTitle("🌐 Translation")
      .setDescription(`**Original:** ${text.substring(0, 500)}\n\n**Target Language:** ${targetLang}\n\n*Translation API not configured*`)
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName} | Translation` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};