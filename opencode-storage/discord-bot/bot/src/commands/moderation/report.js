const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const { modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report a user to staff")
    .addUserOption((o) => o.setName("user").setDescription("User to report").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for reporting").setRequired(true)),

  async execute(interaction, client) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    const guildConfig = client.guildConfig?.get(interaction.guild.id);
    const modLogId = guildConfig?.modLogChannelId;
    const modLog = modLogId
      ? interaction.guild.channels.cache.get(modLogId)
      : interaction.guild.channels.cache.find((c) => c.name === config.modLogChannel);

    if (!modLog) return interaction.reply({ content: "No mod-log channel found. Ask an admin to run `/setup modlog`.", ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("User Report")
      .setColor(config.colors.warning)
      .addFields(
        { name: "Reported User", value: `<@${user.id}> (${user.tag})`, inline: true },
        { name: "Reported By", value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Channel", value: interaction.channel.toString(), inline: true },
        { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setFooter({ text: `${config.botName} | Report #${Date.now().toString(36)}` })
      .setTimestamp();

    await modLog.send({ embeds: [embed] });
    await interaction.reply({ embeds: [modEmbed("Report Submitted", `Your report against <@${user.id}> has been sent to staff.`)], ephemeral: true });
  },
};