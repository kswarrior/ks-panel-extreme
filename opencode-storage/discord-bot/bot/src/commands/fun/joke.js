const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

const jokes = [
  "Why do programmers prefer dark mode? Because light attracts bugs!",
  "Why did the developer go broke? Because he used up all his cache!",
  "What's a programmer's favorite hangout place? Foo Bar!",
  "Why do Java developers wear glasses? Because they can't C#!",
  "There are only 10 types of people: those who understand binary, and those who don't.",
  "A SQL query walks into a bar, sees two tables, and asks: 'Can I join you?'",
  "Why was the JavaScript developer sad? Because he didn't Node how to Express himself.",
  "What's the object-oriented way to become wealthy? Inheritance!",
  "Why do programmers mix up Halloween and Christmas? Because Oct 31 = Dec 25!",
  "How many programmers does it take to change a light bulb? None, that's a hardware problem!",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("joke")
    .setDescription("Get a random programming joke"),

  async execute(interaction) {
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    const embed = new EmbedBuilder()
      .setTitle("Joke")
      .setDescription(joke)
      .setColor(config.colors.warning)
      .setFooter({ text: `${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};