const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("eco-coinflip")
    .setDescription("Bet credits on a coin flip (Heads or Tails)")
    .addStringOption(o => o.setName("side").setDescription("Heads or Tails").setRequired(true)
      .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" }))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to bet").setRequired(true)),

  async execute(interaction) {
    const side = interaction.options.getString("side");
    const amount = interaction.options.getInteger("amount");
    const isOwner = economy.isOwner(interaction.user.id);

    if (amount <= 0) return interaction.reply({ content: "❌ Please bet a positive amount!", ephemeral: true });
    
    const userData = economy.getOrCreateUser(interaction.user.id);
    if (!isOwner && userData.balance < amount) {
      return interaction.reply({ content: "❌ You don't have enough credits!", ephemeral: true });
    }

    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = side === result;

    if (!isOwner) {
      if (won) {
        economy.addBalance(interaction.user.id, amount);
      } else {
        economy.removeBalance(interaction.user.id, amount);
      }
    }

    const finalBalance = economy.getUser(interaction.user.id).balance;
    const embed = new EmbedBuilder()
      .setTitle(won ? "🎉 You Won!" : "💀 You Lost!")
      .setDescription(`The coin landed on **${result.toUpperCase()}**.\n\n${won ? `You gained **${amount.toLocaleString()} KC**!` : `You lost **${amount.toLocaleString()} KC**!`}`)
      .addFields({ name: "New Balance", value: `${finalBalance.toLocaleString()} KC` })
      .setColor(won ? config.colors.success : config.colors.error)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
