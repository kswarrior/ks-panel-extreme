const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a quick round of Blackjack")
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to bet").setRequired(true)),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const isOwner = economy.isOwner(interaction.user.id);

    if (amount <= 0) return interaction.reply({ content: "❌ Please bet a positive amount!", ephemeral: true });
    
    const userData = economy.getOrCreateUser(interaction.user.id);
    if (!isOwner && userData.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough credits!", ephemeral: true });
    }

    // Simplified Blackjack: User gets a random total 12-21, Dealer gets 12-21
    const userHand = Math.floor(Math.random() * 10) + 12;
    const dealerHand = Math.floor(Math.random() * 10) + 12;

    let result = "";
    let won = false;

    if (userHand > dealerHand) {
      result = "You won!";
      won = true;
    } else if (userHand < dealerHand) {
      result = "Dealer won!";
    } else {
      result = "Push (Tie)!";
    }

    if (!isOwner) {
      if (won) {
        economy.addBalance(interaction.user.id, amount);
      } else if (result !== "Push (Tie)!") {
        economy.removeBalance(interaction.user.id, amount);
      }
    }

    const finalBalance = economy.getUser(interaction.user.id).balance;
    const embed = new EmbedBuilder()
      .setTitle("🃏 Blackjack")
      .setDescription(`Your Hand: **${userHand}**\nDealer Hand: **${dealerHand}**\n\n**${result}**`)
      .addFields({ name: "New Balance", value: `${finalBalance.toLocaleString()} KC` })
      .setColor(won ? config.colors.success : (result === "Push (Tie)!" ? config.colors.info : config.colors.error))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
