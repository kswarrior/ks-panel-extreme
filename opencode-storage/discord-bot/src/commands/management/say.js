const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const { modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot say a message")
    .addStringOption((o) => o.setName("message").setDescription("Message to send").setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to send in (defaults to current)").setRequired(false)),

  async execute(interaction) {
    const message = interaction.options.getString("message");
    const channel = interaction.options.getChannel("channel") || interaction.channel;

    await channel.send(message);
    await interaction.reply({ embeds: [modEmbed("Message Sent", `Sent to ${channel}`)], ephemeral: true });
  },
};