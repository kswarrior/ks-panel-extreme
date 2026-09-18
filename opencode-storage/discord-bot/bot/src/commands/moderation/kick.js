const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { errorEmbed, modEmbed } = require("../../utils/embed");
const { resolveMember, canActOn } = require("../../utils/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName("user").setDescription("The user to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the kick").setRequired(false)),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";
    const member = await resolveMember(interaction.guild, user.id);

    if (!member) return interaction.reply({ embeds: [errorEmbed("Error", "User not found in this server.")], ephemeral: true });
    if (!member.kickable && !user.bot) return interaction.reply({ embeds: [errorEmbed("Error", "I cannot kick this user.")], ephemeral: true });

    const check = canActOn(interaction.member, member, interaction.guild);
    if (!check.ok && user.id !== interaction.guild.ownerId) {
      return interaction.reply({ embeds: [errorEmbed("Error", check.reason)], ephemeral: true });
    }

    try {
      await member.kick(reason);
      await interaction.reply({ embeds: [modEmbed("Kicked", `<@${user.id}> kicked.\nReason: ${reason}\nMod: ${interaction.user}`)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Failed", err.message)], ephemeral: true });
    }
  },
};
