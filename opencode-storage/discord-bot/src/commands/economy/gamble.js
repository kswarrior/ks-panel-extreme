const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gamble")
    .setDescription("Gamble your KS Hub Credits")
    .addIntegerOption((o) =>
      o.setName("amount").setDescription("Amount to gamble").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("choice").setDescription("Choose high or low").setRequired(true)
        .addChoices(
          { name: "High (7-12)", value: "high" },
          { name: "Low (1-6)", value: "low" }
        )
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const choice = interaction.options.getString("choice");
    const userData = economy.getOrCreateUser(interaction.user.id);

    if (amount <= 0) {
      return interaction.reply({ content: "❌ You must gamble a positive amount!", ephemeral: true });
    }

    if (amount > userData.balance) {
      return interaction.reply({ content: "❌ You don't have enough credits!", ephemeral: true });
    }

    const roll = Math.floor(Math.random() * 12) + 1;
    const isHigh = roll >= 7;
    const isLow = roll <= 6;
    
    let won = false;
    if ((choice === "high" && isHigh) || (choice === "low" && isLow)) {
      won = true;
    }

    if (won) {
      const newBalance = economy.addBalance(interaction.user.id, amount);
      const embed = new EmbedBuilder()
        .setTitle("🎰 You Won!")
        .setDescription(`Rolled **${roll}** (${isHigh ? "High" : "Low"})\nYou chose **${choice}**`)
        .addFields(
          { name: "Won", value: `+${amount.toLocaleString()} KC`, inline: true },
          { name: "New Balance", value: `${newBalance.toLocaleString()} KC`, inline: true }
        )
        .setColor(config.colors.success)
        .setFooter({ text: `${config.botName} | Gamble` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else {
      const newBalance = economy.removeBalance(interaction.user.id, amount);
      const embed = new EmbedBuilder()
        .setTitle("🎰 You Lost!")
        .setDescription(`Rolled **${roll}** (${isHigh ? "High" : "Low"})\nYou chose **${choice}**`)
        .addFields(
          { name: "Lost", value: `-${amount.toLocaleString()} KC`, inline: true },
          { name: "New Balance", value: `${newBalance >= 0 ? newBalance.toLocaleString() : "0"} KC`, inline: true }
        )
        .setColor(config.colors.error)
        .setFooter({ text: `${config.botName} | Gamble` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
