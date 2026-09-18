const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { errorEmbed, modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Retrieve the last deleted message in this channel"),

  async execute(interaction, client) {
    client.snipeMap = client.snipeMap || new Map();
    const sniped = client.snipeMap.get(interaction.channel.id);

    if (!sniped) return interaction.reply({ embeds: [errorEmbed("Nothing to Snipe", "No recently deleted messages.")], ephemeral: true });

    const embed = modEmbed("🔫 Sniped Message", `**Author:** ${sniped.author.tag}\n**Content:** ${sniped.content}`)
      .setFooter({ text: `Sniped | ${sniped.author.tag}` })
      .setTimestamp(sniped.timestamp);

    if (sniped.attachments) {
      embed.setImage(sniped.attachments);
    }

    await interaction.reply({ embeds: [embed] });
  },
};