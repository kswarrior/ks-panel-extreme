const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { modEmbed, errorEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode for a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(false))
    .addIntegerOption((o) => o.setName("seconds").setDescription("Delay in seconds (0 to disable)").setRequired(true).setMinValue(0).setMaxValue(21600)),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const seconds = interaction.options.getInteger("seconds");
    if (!channel || !channel.isTextBased()) return interaction.reply({ embeds: [errorEmbed("Error", "Not a text channel.")], ephemeral: true });
    if (!channel.manageable) return interaction.reply({ embeds: [errorEmbed("Error", "I cannot manage this channel.")], ephemeral: true });

    await channel.setRateLimitPerUser(seconds);
    const action = seconds > 0 ? `Set slowmode to ${seconds}s` : "Disabled slowmode";
    await interaction.reply({ embeds: [modEmbed("Slowmode Updated", `${action} in ${channel}`)] });
  },
};
