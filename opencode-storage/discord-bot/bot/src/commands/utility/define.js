const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("define")
    .setDescription("Get the definition of a word")
    .addStringOption((o) =>
      o.setName("word").setDescription("Word to define").setRequired(true)
    ),

  async execute(interaction) {
    const word = interaction.options.getString("word");

    const embed = new EmbedBuilder()
      .setTitle(`📖 Definition of "${word}"`)
      .setDescription("Dictionary API not configured")
      .addFields(
        { name: "Part of Speech", value: "N/A", inline: true },
        { name: "Definition", value: "N/A", inline: false },
        { name: "Example", value: "N/A", inline: false }
      )
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName} | Dictionary` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};