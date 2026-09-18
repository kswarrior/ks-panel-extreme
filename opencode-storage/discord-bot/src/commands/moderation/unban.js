const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { errorEmbed, modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName("user-id").setDescription("ID of the user to unban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  async execute(interaction) {
    const userId = interaction.options.getString("user-id");
    const reason = interaction.options.getString("reason") || "No reason provided";

    try {
      await interaction.guild.bans.remove(userId, `${reason} by ${interaction.user.tag}`);
      await interaction.reply({ embeds: [modEmbed("Unbanned", `<@${userId}> unbanned.\nReason: ${reason}\nMod: ${interaction.user}`)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Failed", err.message)], ephemeral: true });
    }
  },
};
