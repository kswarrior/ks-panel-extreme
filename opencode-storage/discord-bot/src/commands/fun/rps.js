const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Rock Paper Scissors against the bot")
    .addStringOption((o) =>
      o
        .setName("choice")
        .setDescription("Your choice")
        .setRequired(true)
        .addChoices(
          { name: "🪨 Rock", value: "rock" },
          { name: "📄 Paper", value: "paper" },
          { name: "✂️ Scissors", value: "scissors" }
        )
    ),

  async execute(interaction) {
    const userChoice = interaction.options.getString("choice");
    const choices = ["rock", "paper", "scissors"];
    const botChoice = choices[Math.floor(Math.random() * 3)];

    const emojis = { rock: "🪨", paper: "📄", scissors: "✂️" };

    let result;
    if (userChoice === botChoice) {
      result = "🤝 It's a tie!";
    } else if (
      (userChoice === "rock" && botChoice === "scissors") ||
      (userChoice === "paper" && botChoice === "rock") ||
      (userChoice === "scissors" && botChoice === "paper")
    ) {
      result = "🎉 You win!";
    } else {
      result = "😢 You lose!";
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 Rock Paper Scissors")
      .setColor(config.colors.primary)
      .addFields(
        { name: "Your Choice", value: `${emojis[userChoice]} ${userChoice}`, inline: true },
        { name: "Bot's Choice", value: `${emojis[botChoice]} ${botChoice}`, inline: true },
        { name: "Result", value: result, inline: false }
      )
      .setFooter({ text: `${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};