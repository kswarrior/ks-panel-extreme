const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { modEmbed, errorEmbed } = require("../../utils/embed");
const warningsDB = require("../../utils/database/warnings");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View all warnings for a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to view warnings for").setRequired(true)),

  async execute(interaction, client) {
    const user = interaction.options.getUser("user");
    const warnings = warningsDB.list(interaction.guild.id, user.id);

    if (warnings.length === 0) return interaction.reply({ embeds: [modEmbed("Warnings", `${user} has no warnings.`)] });

    const list = warnings.map((w, i) => `**#${i + 1}** — ${w.reason}\nMod: ${w.moderator} • <t:${Math.floor(w.timestamp / 1000)}:R>`).join("\n\n");
    const embed = new EmbedBuilder().setTitle(`Warnings for ${user.username}`).setDescription(list).setColor(config.colors.warning).setFooter({ text: `${warnings.length} warning(s)` }).setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
