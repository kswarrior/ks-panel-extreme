const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { modEmbed, errorEmbed } = require("../../utils/embed");
const warningsDB = require("../../utils/database/warnings");

async function resolveMember(guild, userId) {
  let member = guild.members.cache.get(userId);
  if (!member) {
    try { member = await guild.members.fetch(userId); } catch { return null; }
  }
  return member;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("The user to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the warning").setRequired(true)),

  async execute(interaction, client) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const member = await resolveMember(interaction.guild, user.id);

    if (!member) return interaction.reply({ embeds: [errorEmbed("Error", "User not found.")], ephemeral: true });
    if (user.id === interaction.guild.ownerId) return interaction.reply({ embeds: [errorEmbed("Error", "You cannot warn the server owner.")], ephemeral: true });

    const id = warningsDB.add(interaction.guild.id, user.id, reason, interaction.user.tag);
    const warnings = warningsDB.list(interaction.guild.id, user.id);

    await interaction.reply({
      embeds: [
        modEmbed(
          "⚠️ Warning Issued",
          `<@${user.id}> has been warned (**${warnings.length}** total warnings).\n**Reason:** ${reason}\n**Moderator:** ${interaction.user}`
        ),
      ],
    });

    try {
      await user.send({ embeds: [modEmbed("⚠️ Warning Received", `You received a warning in **${interaction.guild.name}**\n**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}\n**Total Warnings:** ${warnings.length}`)] }).catch(() => {});
    } catch {}
  },
};
