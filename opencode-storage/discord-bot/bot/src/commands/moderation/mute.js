const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { errorEmbed, modEmbed } = require("../../utils/embed");
const { resolveMember, canActOn } = require("../../utils/moderation");

function parseDuration(str) {
  const m = str.match(/^(\d+)([smhd])$/);
  if (!m) return null;
  const v = parseInt(m[1]);
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return v * mult[m[2]];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout/mute a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("The user to mute").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("Duration (e.g. 10m, 1h, 1d)").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for muting").setRequired(false)),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") || "No reason provided";
    const member = await resolveMember(interaction.guild, user.id);

    if (!member) return interaction.reply({ embeds: [errorEmbed("Error", "User not found.")], ephemeral: true });
    const ms = parseDuration(durationStr);
    if (!ms) return interaction.reply({ embeds: [errorEmbed("Invalid duration", "Use 10m, 1h, 1d")], ephemeral: true });
    if (ms > 2419200000) return interaction.reply({ embeds: [errorEmbed("Too long", "Max 28d")], ephemeral: true });

    const check = canActOn(interaction.member, member, interaction.guild);
    if (!check.ok && user.id !== interaction.guild.ownerId) {
      return interaction.reply({ embeds: [errorEmbed("Error", check.reason)], ephemeral: true });
    }

    try {
      await member.timeout(ms, reason);
      await interaction.reply({ embeds: [modEmbed("Muted", `<@${user.id}> muted for ${durationStr}.\nReason: ${reason}\nMod: ${interaction.user}`)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Failed", err.message)], ephemeral: true });
    }
  },
};
