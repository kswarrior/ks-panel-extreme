const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("channelinfo")
    .setDescription("Get information about a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to inspect").setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;

    const typeNames = {
      [ChannelType.GuildText]: "Text Channel",
      [ChannelType.GuildVoice]: "Voice Channel",
      [ChannelType.GuildCategory]: "Category",
      [ChannelType.GuildAnnouncement]: "Announcement",
      [ChannelType.AnnouncementThread]: "Announcement Thread",
      [ChannelType.PublicThread]: "Public Thread",
      [ChannelType.PrivateThread]: "Private Thread",
      [ChannelType.GuildStageVoice]: "Stage Channel",
      [ChannelType.GuildForum]: "Forum Channel",
    };

    const embed = new EmbedBuilder()
      .setTitle(`ℹ️ #${channel.name}`)
      .setColor(config.colors.info)
      .addFields(
        { name: "ID", value: channel.id, inline: true },
        { name: "Type", value: typeNames[channel.type] || "Unknown", inline: true },
        { name: "Created", value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Position", value: `${channel.position}`, inline: true },
        { name: "NSFW", value: channel.nsfw ? "Yes" : "No", inline: true },
        { name: "Topic", value: channel.topic?.substring(0, 200) || "None", inline: false },
        { name: "Slowmode", value: channel.rateLimitPerUser ? `${channel.rateLimitPerUser}s` : "None", inline: true }
      )
      .setFooter({ text: `${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};