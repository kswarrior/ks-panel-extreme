const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("servericon")
    .setDescription("Get the server icon"),

  async execute(interaction) {
    const guild = interaction.guild;
    const iconURL = guild.iconURL({ dynamic: true, size: 4096 });

    if (!iconURL) return interaction.reply({ content: "This server has no icon set.", ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle(`${guild.name}'s Icon`)
      .setImage(iconURL)
      .setColor(config.colors.info)
      .setDescription(`[PNG](${guild.iconURL({ size: 4096, format: "png" })}) | [JPG](${guild.iconURL({ size: 4096, format: "jpg" })}) | [WEBP](${guild.iconURL({ size: 4096, format: "webp" })})`)
      .setFooter({ text: `${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};