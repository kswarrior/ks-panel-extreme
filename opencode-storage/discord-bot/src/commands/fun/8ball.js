const { SlashCommandBuilder } = require("discord.js");
const { funEmbed } = require("../../utils/embed");

const answers = [
  "It is certain.", "Without a doubt.", "Yes, definitely.",
  "As I see it, yes.", "Most likely.", "Yes.",
  "Reply hazy, try again.", "Ask again later.", "Cannot predict now.",
  "Don't count on it.", "My reply is no.", "No.",
  "Very doubtful.", "Outlook not so good.", "No way!",
  "Absolutely!", "For sure!", "I think so...",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a question")
    .addStringOption((o) =>
      o.setName("question").setDescription("Your question").setRequired(true)
    ),

  async execute(interaction) {
    const question = interaction.options.getString("question");
    const answer = answers[Math.floor(Math.random() * answers.length)];

    const card = funEmbed("Magic 8-Ball", "");
    require("../../utils/embed").addSection(card,
      `### ❓ Question\n${question}`,
      `### 🔮 Answer\n||**${answer}**||`
    );

    await interaction.reply({ embeds: [card] });
  },
};