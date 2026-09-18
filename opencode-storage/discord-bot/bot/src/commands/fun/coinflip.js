const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Bet on a coin flip")
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Amount of KC to bet")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((o) =>
      o
        .setName("target")
        .setDescription("Your guess: heads or tails")
        .setRequired(true)
        .addChoices(
          { name: "Heads", value: "heads" },
          { name: "Tails", value: "tails" }
        )
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const target = interaction.options.getString("target").toLowerCase();

    const userData = economy.getUser(interaction.user.id);
    if (!userData || userData.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough KC to bet that amount.", ephemeral: true });
    }

    // Deduct the bet amount
    const newBal = economy.removeBalance(interaction.user.id, amount);
    if (newBal === -1) {
      return interaction.reply({ content: "❌ Insufficient balance.", ephemeral: true });
    }

    const flipResult = Math.random() < 0.5 ? "heads" : "tails";
    const isWin = flipResult === target;
    let resultText;
    if (isWin) {
      // Award double the bet (net win = amount)
      economy.addBalance(interaction.user.id, amount * 2);
      resultText = `You guessed **${target}** and won! 🎉 You receive **${amount * 2} KC**.`;
    } else {
      resultText = `You guessed **${target}**, but it was **${flipResult}**. You lost **${amount} KC**.`;
    }

    const embed = new EmbedBuilder()
        .setTitle(isWin ? "🪙 Coin Flip – You Win!" : "🪙 Coin Flip – You Lose")
        .setDescription(resultText)
        .setColor(isWin ? config.colors.success : config.colors.error)
        .setFooter({ text: `Flipped by ${interaction.user.tag} | ${config.botName}` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};