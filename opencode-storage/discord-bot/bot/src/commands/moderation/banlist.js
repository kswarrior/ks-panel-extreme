const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const { modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("banlist")
    .setDescription("View all banned users in the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const bans = await interaction.guild.bans.fetch();

      if (bans.size === 0) return interaction.editReply({ content: "No banned users found." });

      const list = bans.map((ban) => `• **${ban.user.tag}** (${ban.user.id}) — ${ban.reason || "No reason"}`).slice(0, 20).join("\n");
      const embed = new EmbedBuilder()
        .setTitle(`Ban List (${bans.size} total)`)
        .setDescription(list + (bans.size > 20 ? `\n\n...and ${bans.size - 20} more` : ""))
        .setColor(config.colors.info)
        .setFooter({ text: `${config.botName}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `Failed: ${err.message}` });
    }
  },
};