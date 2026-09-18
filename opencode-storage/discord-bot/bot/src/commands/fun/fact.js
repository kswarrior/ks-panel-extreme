const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

const FACTS = {
  animal: [
    "Honey never spoils.",
    "Octopuses have three hearts.",
    "Bananas are berries, but strawberries aren't.",
    "A group of flamingos is called a 'flamboyance'.",
    "Sea otters hold hands when they sleep.",
  ],
  science: [
    "Water expands when it freezes.",
    "The human brain uses about 20% of the body's energy.",
    "Lightning strikes Earth about 44 times per second.",
    "There are more stars in the universe than grains of sand on Earth.",
    "Sound travels 14 times faster in water than in air.",
  ],
  space: [
    "A day on Venus is longer than its year.",
    "Neutron stars can spin at a rate of 600 rotations per second.",
    "The footprints on the Moon will be there for 100 million years.",
    "Space has a smell - astronauts report a gunpowder scent on their suits.",
    "The Sun makes up 99.86% of the solar system's mass.",
  ],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fact")
    .setDescription("Get a random fact")
    .addStringOption((o) =>
      o.setName("category").setDescription("Category of fact").setRequired(false)
        .addChoices(
          { name: "Animal", value: "animal" },
          { name: "Science", value: "science" },
          { name: "Space", value: "space" }
        )
    ),

  async execute(interaction) {
    const category = interaction.options.getString("category");
    
    let facts;
    if (category) {
      facts = FACTS[category];
    } else {
      const categories = Object.keys(FACTS);
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      facts = FACTS[randomCategory];
    }

    const fact = facts[Math.floor(Math.random() * facts.length)];

    const embed = new EmbedBuilder()
      .setTitle(`💡 Random ${category ? category.charAt(0).toUpperCase() + category.slice(1) : ""} Fact`)
      .setDescription(fact)
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | Random Facts` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};