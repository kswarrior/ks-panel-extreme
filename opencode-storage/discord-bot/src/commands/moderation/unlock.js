const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { errorEmbed, successEmbed, modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to unlock").setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({ embeds: [errorEmbed("Error", "This is not a valid text channel.")], ephemeral: true });
    }
    if (!channel.manageable) {
      return interaction.reply({ embeds: [errorEmbed("Error", "I do not have permission to manage that channel.")], ephemeral: true });
    }
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { sendMessages: true });
    await interaction.reply({ embeds: [modEmbed("Unlocked", `${channel} has been unlocked.`)] });
  },
};
