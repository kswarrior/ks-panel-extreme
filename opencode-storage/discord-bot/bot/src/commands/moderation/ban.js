const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { errorEmbed, modEmbed } = require("../../utils/embed");
const { resolveMember, canActOn } = require("../../utils/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("The user to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the ban").setRequired(false))
    .addIntegerOption((o) =>
      o
        .setName("days")
        .setDescription("Days of messages to delete (0-7)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";
    const days = interaction.options.getInteger("days") || 0;
    const member = await resolveMember(interaction.guild, user.id);

    if (!member) return interaction.reply({ embeds: [errorEmbed("Error", "User not found in this server.")], ephemeral: true });
    if (!member.bannable && !user.bot) return interaction.reply({ embeds: [errorEmbed("Error", "I cannot ban this user. Check role hierarchy.")], ephemeral: true });

    const actor = interaction.member;
    const check = canActOn(actor, member, interaction.guild);
    if (!check.ok && user.id !== interaction.guild.ownerId) {
      return interaction.reply({ embeds: [errorEmbed("Error", check.reason)], ephemeral: true });
    }

    try {
      if (member.bannable) await member.ban({ days, reason: `${reason} by ${interaction.user.tag}` });
      else await interaction.guild.bans.create(user.id, { deleteMessageDays: days, reason: `${reason} by ${interaction.user.tag}` });

      await interaction.reply({ embeds: [modEmbed("🔨 Banned", `<@${user.id}> banned.\nReason: ${reason}\nModerator: ${interaction.user}`)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Failed", err.message)], ephemeral: true });
    }
  },
};
