const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Spin the slot machine to win big!")
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to bet").setRequired(true)),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const isOwner = economy.isOwner(interaction.user.id);

    if (amount <= 0) return interaction.reply({ content: "❌ Please bet a positive amount!", ephemeral: true });
    
    const userData = economy.getOrCreateUser(interaction.user.id);
    if (!isOwner && userData.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough credits!", ephemeral: true });
    }

    const emojis = ["🍎", "💎", "🍀", "🍋", "🍒"];
    const spin = [
      emojis[Math.floor(Math.random() * emojis.length)],
      emojis[Math.floor(Math.random() * emojis.length)],
      emojis[Math.floor(Math.random() * emojis.length)]
    ];

    let multiplier = 0;
    if (spin[0] === spin[1] && spin[1] === spin[2]) multiplier = 10; // Jackpot
    else if (spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2]) multiplier = 2; // Pair

    const won = multiplier > 0;
    const winnings = amount * multiplier;

    if (!isOwner) {
      if (won) {
        economy.addBalance(interaction.user.id, winnings - amount);
      } else {
        economy.removeBalance(interaction.user.id, amount);
      }
    }

    const finalBalance = economy.getUser(interaction.user.id).balance;
    const embed = new EmbedBuilder()
      .setTitle(won ? "🎰 JACKPOT!" : "🎰 Bad Luck!")
      .setDescription(`**[ ${spin.join(" | ")} ]**\n\n${won ? `You won **${winnings.toLocaleString()} KC**!` : `You lost your bet.`}`)
      .addFields({ name: "New Balance", value: `${finalBalance.toLocaleString()} KC` })
      .setColor(won ? config.colors.success : config.colors.error)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
