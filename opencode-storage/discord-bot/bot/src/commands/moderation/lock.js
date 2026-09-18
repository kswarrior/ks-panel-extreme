const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { errorEmbed, successEmbed, modEmbed } = require("../../utils/embed");

async function resolveMember(guild, userId) {
  let member = guild.members.cache.get(userId);
  if (!member) {
    try { member = await guild.members.fetch(userId); } catch { return null; }
  }
  return member;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel to prevent messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to lock").setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({ embeds: [errorEmbed("Error", "This is not a valid text channel.")], ephemeral: true });
    }
    if (!channel.manageable) {
      return interaction.reply({ embeds: [errorEmbed("Error", "I do not have permission to manage that channel.")], ephemeral: true });
    }
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { sendMessages: false });
    await interaction.reply({ embeds: [modEmbed("Locked", `${channel} has been locked.`)] });
  },
};
