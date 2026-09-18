const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

const DAILY_AMOUNT = 100;
const COOLDOWN = 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily KS Hub Credits"),

  async execute(interaction) {
    const userData = economy.getOrCreateUser(interaction.user.id);
    const now = Date.now();

    if (userData.lastDaily && now - userData.lastDaily < COOLDOWN) {
      const remaining = COOLDOWN - (now - userData.lastDaily);
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

      const embed = new EmbedBuilder()
        .setTitle("⏰ Daily Already Claimed")
        .setDescription(`You've already claimed your daily credits today!`)
        .addFields({ name: "Next claim in", value: `${hours}h ${minutes}m`, inline: true })
        .setColor(config.colors.warning)
        .setFooter({ text: `${config.botName} | Daily Rewards` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    const newBalance = economy.addBalance(interaction.user.id, DAILY_AMOUNT);
    economy.setCooldown(interaction.user.id, "lastDaily", now);

    const streak = Math.floor((userData.daily || 0) + 1);
    economy.setCooldown(interaction.user.id, "daily", streak);

    const embed = new EmbedBuilder()
      .setTitle("✅ Daily Rewards Claimed!")
      .setDescription(`You received **${DAILY_AMOUNT.toLocaleString()} KC**!`)
      .addFields(
        { name: "New Balance", value: `${newBalance.toLocaleString()} KC`, inline: true },
        { name: "Streak", value: `${streak} days`, inline: true }
      )
      .setColor(config.colors.success)
      .setFooter({ text: `${config.botName} | Daily Rewards` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
