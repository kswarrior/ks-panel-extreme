const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avatar-server")
    .setDescription("Get the server banner/banner image"),

  async execute(interaction) {
    const guild = interaction.guild;
    const bannerURL = guild.bannerURL({ dynamic: true, size: 4096 });
    const splashURL = guild.splashURL({ dynamic: true, size: 4096 });

    if (!bannerURL && !splashURL) return interaction.reply({ content: "This server has no banner or splash image.", ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle(`${guild.name}`)
      .setColor(config.colors.info)
      .setTimestamp();

    if (bannerURL) {
      embed.setImage(bannerURL).setDescription(`[Banner PNG](${guild.bannerURL({ size: 4096, format: "png" })})`);
    } else if (splashURL) {
      embed.setImage(splashURL).setDescription(`[Splash PNG](${guild.splashURL({ size: 4096, format: "png" })})`);
    }

    await interaction.reply({ embeds: [embed] });
  },
};