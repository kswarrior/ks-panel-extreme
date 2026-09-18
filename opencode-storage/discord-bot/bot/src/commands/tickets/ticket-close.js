const { SlashCommandBuilder } = require("discord.js");
const { modEmbed, errorEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-close")
    .setDescription("Close the current ticket channel"),

  async execute(interaction) {
    if (!interaction.channel.name.startsWith("ticket-")) {
      return interaction.reply({ embeds: [errorEmbed("Error", "This is not a ticket channel.")], ephemeral: true });
    }

    await interaction.reply({ embeds: [modEmbed("🔒 Ticket Closing", "This ticket will be deleted in 5 seconds...")] });

    setTimeout(async () => {
      await interaction.channel.delete().catch(() => {});
    }, 5000);
  },
};