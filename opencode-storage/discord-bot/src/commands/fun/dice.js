const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Bet on a dice roll (1-6)")
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Amount of KC to bet")
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((o) =>
      o
        .setName("guess")
        .setDescription("Your guess (1-6)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(6)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const guess = interaction.options.getInteger("guess");

    const userData = economy.getUser(interaction.user.id);
    if (!userData || userData.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough KC to bet that amount.", ephemeral: true });
    }

    // Deduct bet amount
    const newBal = economy.removeBalance(interaction.user.id, amount);
    if (newBal === -1) {
      return interaction.reply({ content: "❌ Insufficient balance.", ephemeral: true });
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    const isWin = roll === guess;
    let resultText;
    if (isWin) {
      const reward = amount * 6;
      economy.addBalance(interaction.user.id, reward);
      resultText = `You guessed **${guess}** and the dice rolled **${roll}**. 🎉 You win **${reward} KC**!`;
    } else {
      resultText = `You guessed **${guess}** but the dice rolled **${roll}**. You lose **${amount} KC**.`;
    }

    const embed = new EmbedBuilder()
      .setTitle(isWin ? "🎲 Dice – You Win!" : "🎲 Dice – You Lose")
      .setDescription(resultText)
      .setColor(isWin ? config.colors.success : config.colors.error)
      .setFooter({ text: `Rolled by ${interaction.user.tag} | ${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
