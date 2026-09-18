const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../../config");
const { successEmbed, errorEmbed, modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock or unlock a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to lock/unlock").addChannelTypes(ChannelType.GuildText).setRequired(false)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;

    const everyone = interaction.guild.roles.everyone;
    const currentPerms = channel.permissionOverwrites.cache.get(everyone.id);

    if (currentPerms && currentPerms.deny.has("SendMessages")) {
      await channel.permissionOverwrites.edit(everyone, { SendMessages: null });
      await interaction.reply({ embeds: [successEmbed("🔓 Channel Unlocked", `${channel} is now unlocked.`)] });
    } else {
      await channel.permissionOverwrites.edit(everyone, { SendMessages: false });
      await interaction.reply({ embeds: [modEmbed("🔒 Channel Locked", `${channel} is now locked down.`)] });
    }
  },
};