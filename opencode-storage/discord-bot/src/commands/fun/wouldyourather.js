const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("wouldyourather")
    .setDescription("Get a random 'Would You Rather' question"),

  async execute(interaction) {
    const questions = [
      "Would you rather be able to fly or be invisible?",
      "Would you rather explore the ocean or outer space?",
      "Would you rather have unlimited money or unlimited time?",
      "Would you rather speak all languages or be able to talk to animals?",
      "Would you rather live in the past or the future?",
      "Would you rather be super strong or super fast?",
      "Would you rather have teleportation or time travel?",
      "Would you rather be famous for something or anonymous but wealthy?",
      "Would you rather lose your phone or lose your wallet?",
      "Would you rather always be hot or always be cold?",
      "Would you rather have no internet or no TV?",
      "Would you rather be able to read minds or predict the future?",
      "Would you rather live underwater or in space?",
      "Would you rather have a dragon or a unicorn as a pet?",
      "Would you rather never sleep or never eat?",
    ];

    const question = questions[Math.floor(Math.random() * questions.length)];

    const embed = new EmbedBuilder()
      .setTitle("🤔 Would You Rather?")
      .setDescription(question)
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | Would You Rather` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};