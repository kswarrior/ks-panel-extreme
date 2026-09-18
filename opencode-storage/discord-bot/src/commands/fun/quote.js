const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quote")
    .setDescription("Get an inspirational quote"),

  async execute(interaction) {
    const quotes = [
      { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
      { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
      { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
      { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
      { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
      { text: "In the end, we only regret the chances we didn't take.", author: "Lewis Carroll" },
      { text: "Success is not final, failure is not fatal: It is the courage to continue that counts.", author: "Winston Churchill" },
      { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
      { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
      { text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
    ];

    const quote = quotes[Math.floor(Math.random() * quotes.length)];

    const embed = new EmbedBuilder()
      .setTitle("💭 Inspirational Quote")
      .setDescription(`"${quote.text}"`)
      .addFields({ name: "Author", value: quote.author, inline: true })
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | Quotes` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};