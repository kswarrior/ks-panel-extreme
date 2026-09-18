const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Get a random trivia question")
    .addStringOption((o) =>
      o.setName("category").setDescription("Trivia category").setRequired(false)
        .addChoices(
          { name: "General", value: "general" },
          { name: "Science", value: "science" },
          { name: "History", value: "history" },
          { name: "Geography", value: "geography" }
        )
    ),

  async execute(interaction) {
    const category = interaction.options.getString("category") || "general";

    const trivia = {
      general: [
        { q: "What is the capital of France?", a: "Paris" },
        { q: "Who painted the Mona Lisa?", a: "Leonardo da Vinci" },
        { q: "What is the largest ocean?", a: "Pacific Ocean" },
      ],
      science: [
        { q: "What is the chemical symbol for gold?", a: "Au" },
        { q: "What planet is known as the Red Planet?", a: "Mars" },
        { q: "What is the hardest natural substance?", a: "Diamond" },
      ],
      history: [
        { q: "Who was the first President of the United States?", a: "George Washington" },
        { q: "In what year did World War II end?", a: "1945" },
        { q: "Who discovered America?", a: "Christopher Columbus" },
      ],
      geography: [
        { q: "What is the largest country by area?", a: "Russia" },
        { q: "Which continent is the Sahara Desert located?", a: "Africa" },
        { q: "What is the longest river in the world?", a: "Nile River" },
      ],
    };

    const questions = trivia[category] || trivia.general;
    const question = questions[Math.floor(Math.random() * questions.length)];

    const embed = new EmbedBuilder()
      .setTitle(`🧠 Trivia Question - ${category.charAt(0).toUpperCase() + category.slice(1)}`)
      .setDescription(question.q)
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | Trivia` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};