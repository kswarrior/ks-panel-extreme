const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a dice")
    .addIntegerOption((o) =>
      o
        .setName("sides")
        .setDescription("Number of sides (default 6)")
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false)
    ),

  async execute(interaction) {
    const sides = interaction.options.getInteger("sides") || 6;
    const result = Math.floor(Math.random() * sides) + 1;

    const embed = new EmbedBuilder()
      .setTitle("🎲 Dice Roll")
      .setDescription(`You rolled a **${result}** out of **${sides}**!`)
      .setColor(config.colors.primary)
      .setFooter({ text: `Rolled by ${interaction.user.tag} | ${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};