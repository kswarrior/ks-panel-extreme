const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("beg")
    .setDescription("Beg for KS Hub Credits"),

  async execute(interaction) {
    const userData = economy.getOrCreateUser(interaction.user.id);
    const now = Date.now();

    const COOLDOWN = 30 * 60 * 1000;

    if (userData.lastBeg && now - userData.lastBeg < COOLDOWN) {
      const remaining = COOLDOWN - (now - userData.lastBeg);
      const minutes = Math.floor(remaining / (60 * 1000));
      const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

      const embed = new EmbedBuilder()
        .setTitle("⏰ Begging Cooldown")
        .setDescription(`You've begged recently. People need time to refill their pockets!`)
        .addFields({ name: "Try again in", value: `${minutes}m ${seconds}s`, inline: true })
        .setColor(config.colors.warning)
        .setFooter({ text: `${config.botName} | Beg` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    const amounts = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    const earned = amounts[Math.floor(Math.random() * amounts.length)];
    
    const messages = [
      "Someone took pity on you and gave you some credits.",
      "You begged on the streets and found some loose credits.",
      "A kind stranger handed you some credits.",
      "You danced for credits and people threw some your way.",
      "You told jokes and earned some tips.",
    ];

    const message = messages[Math.floor(Math.random() * messages.length)];

    const newBalance = economy.addBalance(interaction.user.id, earned);
    economy.setCooldown(interaction.user.id, "lastBeg", now);

    const embed = new EmbedBuilder()
      .setTitle("🥺 Begging Complete!")
      .setDescription(`${message}`)
      .addFields(
        { name: "Earned", value: `${earned.toLocaleString()} KC`, inline: true },
        { name: "New Balance", value: `${newBalance.toLocaleString()} KC`, inline: true }
      )
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName} | Beg` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
