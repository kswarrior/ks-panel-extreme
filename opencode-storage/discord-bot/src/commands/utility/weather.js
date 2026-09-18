const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("weather")
    .setDescription("Get weather information for a location")
    .addStringOption((o) =>
      o.setName("location").setDescription("City name").setRequired(true)
    ),

  async execute(interaction) {
    const location = interaction.options.getString("location");

    const embed = new EmbedBuilder()
      .setTitle(`🌤️ Weather for ${location}`)
      .setDescription("Weather data unavailable - API not configured")
      .addFields(
        { name: "Temperature", value: "N/A", inline: true },
        { name: "Condition", value: "N/A", inline: true },
        { name: "Humidity", value: "N/A", inline: true }
      )
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName} | Weather Command` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};