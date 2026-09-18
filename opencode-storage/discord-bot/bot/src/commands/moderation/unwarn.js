const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { errorEmbed, successEmbed, modEmbed } = require("../../utils/embed");
const warningsDB = require("../../utils/database/warnings");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Remove a warning from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to unwarn").setRequired(true))
    .addIntegerOption((o) => o.setName("warning-id").setDescription("Warning ID to remove").setRequired(true)),

  async execute(interaction, client) {
    const user = interaction.options.getUser("user");
    const warningId = interaction.options.getInteger("warning-id");

    const warnings = warningsDB.list(interaction.guild.id, user.id);
    if (warnings.length === 0) return interaction.reply({ embeds: [errorEmbed("No Warnings", "This user has no warnings.")],
      ephemeral: true });

    const idx = warningId - 1;
    if (idx < 0 || idx >= warnings.length) return interaction.reply({ embeds: [errorEmbed("Invalid ID", "Warning ID not found.")],
      ephemeral: true });

    const removed = warnings[idx];
    warningsDB.remove(interaction.guild.id, user.id, warningId);

    await interaction.reply({
      embeds: [
        modEmbed("Warning Removed", `Removed warning #${warningId} from ${user}\n**Reason:** ${removed.reason}`),
      ],
    });
  },
};
