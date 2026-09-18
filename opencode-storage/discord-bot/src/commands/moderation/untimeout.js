const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { errorEmbed, modEmbed } = require("../../utils/embed");
const { resolveMember, canActOn } = require("../../utils/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove timeout from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to remove timeout from").setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const member = await resolveMember(interaction.guild, user.id);
    if (!member) return interaction.reply({ embeds: [errorEmbed("Error", "User not found.")], ephemeral: true });
    if (!member.isCommunicationDisabled()) return interaction.reply({ content: `<@${user.id}> is not timed out.`, ephemeral: true });

    try {
      await member.disableCommunicationUntil(null, "Timeout removed by " + interaction.user.tag);
      await interaction.reply({ embeds: [modEmbed("Timeout Removed", `<@${user.id}> timeout removed.\nMod: ${interaction.user}`)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Failed", err.message)], ephemeral: true });
    }
  },
};
