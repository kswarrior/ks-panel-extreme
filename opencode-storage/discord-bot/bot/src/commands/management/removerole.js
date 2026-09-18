const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { modEmbed, errorEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removerole")
    .setDescription("Remove a role from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const role = interaction.options.getRole("role");
    const member = interaction.guild.members.cache.get(user.id);
    if (!member) return interaction.reply({ embeds: [errorEmbed("Error", "User not found.")], ephemeral: true });

    if (!member.roles.cache.has(role.id)) return interaction.reply({ embeds: [errorEmbed("No Role", `${user} doesn't have ${role}`)], ephemeral: true });

    try {
      await member.roles.remove(role);
      await interaction.reply({ embeds: [modEmbed("Role Removed", `Removed ${role} from <@${user.id}>`)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Error", `Failed: ${err.message}`)], ephemeral: true });
    }
  },
};