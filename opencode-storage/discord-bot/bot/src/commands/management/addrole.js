const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { modEmbed, errorEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("Add a role to a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Role to add").setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const role = interaction.options.getRole("role");
    const member = interaction.guild.members.cache.get(user.id);
    if (!member) return interaction.reply({ embeds: [errorEmbed("Error", "User not found.")], ephemeral: true });

    if (member.roles.cache.has(role.id)) return interaction.reply({ embeds: [errorEmbed("Already Has Role", `${user} already has ${role}`)], ephemeral: true });

    try {
      await member.roles.add(role);
      await interaction.reply({ embeds: [modEmbed("Role Added", `Added ${role} to <@${user.id}>`)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Error", `Failed: ${err.message}`)], ephemeral: true });
    }
  },
};