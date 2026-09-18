const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Get a user's avatar")
    .addUserOption((o) =>
      o.setName("user").setDescription("The user").setRequired(false)
    )
    .addStringOption((o) =>
      o
        .setName("size")
        .setDescription("Image size")
        .setChoices(
          { name: "128px", value: "128" },
          { name: "256px", value: "256" },
          { name: "512px", value: "512" },
          { name: "1024px", value: "1024" },
          { name: "2048px", value: "2048" }
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const size = parseInt(interaction.options.getString("size") || "1024");

    const embed = new EmbedBuilder()
      .setTitle(`🖼️ ${user.username}'s Avatar`)
      .setImage(user.displayAvatarURL({ dynamic: true, size, format: "png" }))
      .setColor(config.colors.info)
      .setDescription(`[PNG](${user.displayAvatarURL({ size, format: "png" })}) | [JPG](${user.displayAvatarURL({ size, format: "jpg" })}) | [WEBP](${user.displayAvatarURL({ size, format: "webp" })})${user.avatar?.startsWith("a_") ? ` | [GIF](${user.displayAvatarURL({ size, format: "gif" })})` : ""}`)
      .setFooter({ text: `${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};