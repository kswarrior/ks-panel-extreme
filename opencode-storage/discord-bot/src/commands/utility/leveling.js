const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");
const levelDB = require("../../utils/database/leveling");
const LEVEL_COOLDOWN = 60000;
const XP_MIN = 5;
const XP_MAX = 25;

function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function processXP(userId, guildId) {
  // Generate XP gain and delegate to DB which handles cooldown and level‑up logic
  const xpGain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  const result = levelDB.addXP(guildId, userId, xpGain, LEVEL_COOLDOWN);
  // result is null if cooldown not passed or no level up, otherwise contains leveled info
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your or another user's level and XP")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check").setRequired(false)
    ),

  async execute(interaction, client) {
    const target = interaction.options.getUser("user") || interaction.user;

    const userData = levelDB.get(interaction.guild.id, target.id) || { xp: 0, level: 1, lastXP: 0 };
    const required = xpForLevel(userData.level);

    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Level`)
      .setDescription(
        `**Level:** ${userData.level}\n**XP:** ${userData.xp} / ${required}`
      )
      .setColor(config.colors.info)
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: `${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async handleMessage(message, client) {
    if (!message.guild) return;

    // Process XP for leveling
    const result = processXP(message.author.id, message.guild.id);

    // Message KC earnings (10 KC per message, 1000 KC per 100 messages)
    economy.updateUser(message.author.id, (user) => {
      user.messageCount = (user.messageCount || 0) + 1;
      if (user.messageCount >= 100) {
        const batches = Math.floor(user.messageCount / 100);
        const reward = batches * 1000;
        user.messageCount = user.messageCount % 100;
        user.balance = (user.balance || 0) + reward;
        user.totalEarned = (user.totalEarned || 0) + reward;
      }
    });

    // If a level up occurred, announce it
    if (result) {
      const channel = message.guild.channels.cache.find(
        (c) => c.name.toLowerCase() === "level-up" || c.name.toLowerCase() === "lvlup"
      );
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setTitle("🎉 Level Up!")
        .setDescription(`${message.author} has reached **Level ${result.level}**!`)
        .setColor(config.colors.success)
        .setFooter({ text: `${config.botName}` })
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  },
};
