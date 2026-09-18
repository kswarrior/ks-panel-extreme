const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("math")
    .setDescription("Do a quick math calculation")
    .addStringOption((o) => o.setName("expression").setDescription("Math expression (e.g. 2+2, 10*5)").setRequired(true)),

  async execute(interaction) {
    const expr = interaction.options.getString("expression");

    if (!/^[0-9+\-*/().%\s^]+$/.test(expr)) {
      return interaction.reply({ content: "Invalid expression. Only numbers and basic operators (+ - * / % ^) are allowed.", ephemeral: true });
    }

    try {
      const safeExpr = expr.replace(/\^/g, "**");
      const result = Function('"use strict"; return (' + safeExpr + ")")();

      const embed = new EmbedBuilder()
        .setTitle("Calculator")
        .setColor(config.colors.info)
        .addFields(
          { name: "Expression", value: `\`\`\`${expr}\`\`\``, inline: false },
          { name: "Result", value: `\`\`\`${result}\`\`\``, inline: false }
        )
        .setFooter({ text: `${config.botName}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch {
      await interaction.reply({ content: "Could not evaluate that expression.", ephemeral: true });
    }
  },
};