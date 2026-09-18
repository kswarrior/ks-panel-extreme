const { EmbedBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  name: "guildMemberAdd",

  async execute(member, client) {
    const welcomeCmd = require("../commands/management/welcomesystem");
    if (welcomeCmd.handleMemberAdd) {
      await welcomeCmd.handleMemberAdd(member, client);
    }

    // Fallback to simple welcome if no config
    const guildConfig = client.welcomeConfig?.get(member.guild.id);
    if (!guildConfig?.welcome) {
      const channel = member.guild.channels.cache.find((c) => c.name === config.welcomeChannel);
      if (!channel) return;

      const memberCount = member.guild.memberCount;
      const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle(`Welcome to ${member.guild.name}!`)
        .setDescription(
          `Welcome ${member.toString()} to **${member.guild.name}**!\n\n` +
          `You are member **#${memberCount}**\n` +
          `Account age: **${accountAge} days**\n\n` +
          `Make sure to read the rules and have fun!`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTimestamp()
        .setFooter({ text: `${config.botName} | KS Hub` });

      await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => {});

      const memberRole = member.guild.roles.cache.find((r) => r.name.toLowerCase() === config.memberRole.toLowerCase());
      if (memberRole) await member.roles.add(memberRole).catch(() => {});
    }
  },
};