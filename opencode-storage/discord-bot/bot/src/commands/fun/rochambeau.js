const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rochambeau")
    .setDescription("Play Rock, Paper, Scissors with the bot")
    .addStringOption((o) =>
      o.setName("choice").setDescription("Your choice").setRequired(true)
        .addChoices(
          { name: "Rock", value: "rock" },
          { name: "Paper", value: "paper" },
          { name: "Scissors", value: "scissors" }
        )
    ),

  async execute(interaction) {
    const userChoice = interaction.options.getString("choice");
    const choices = ["rock", "paper", "scissors"];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    
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
      result = "😢 Bot wins!";
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 Rock, Paper, Scissors")
      .setDescription(
        `**You chose:** ${emojis[userChoice]} ${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}\n` +
        `**Bot chose:** ${emojis[botChoice]} ${botChoice.charAt(0).toUpperCase() + botChoice.slice(1)}\n\n` +
        `**Result:** ${result}`
      )
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | Rock Paper Scissors` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};