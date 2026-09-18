const { EmbedBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  name: "guildMemberRemove",

  async execute(member, client) {
    const welcomeCmd = require("../commands/management/welcomesystem");
    if (welcomeCmd.handleMemberRemove) {
      await welcomeCmd.handleMemberRemove(member, client);
    }

    // Fallback to simple leave if no config
    const guildConfig = client.welcomeConfig?.get(member.guild.id);
    if (!guildConfig?.leave) {
      const channel = member.guild.channels.cache.find((c) => c.name === config.goodbyeChannel);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle("👋 Goodbye!")
        .setDescription(
          `${member.user.tag} has left **${member.guild.name}**\n` +
          `We're now at **${member.guild.memberCount}** members`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTimestamp()
        .setFooter({ text: `${config.botName} | KS Hub` });

      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  },
};