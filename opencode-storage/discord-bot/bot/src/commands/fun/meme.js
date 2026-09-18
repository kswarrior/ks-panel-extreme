const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("meme")
    .setDescription("Get a random meme from the internet"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const fetch = require("node-fetch");
      const res = await fetch("https://meme-api.com/gimme");
      const data = await res.json();

      const embed = new EmbedBuilder()
        .setTitle(data.title || "Random Meme")
        .setImage(data.url)
        .setColor(config.colors.primary)
        .setFooter({ text: `r/${data.subreddit || "meme"} | ${config.botName}` })
        .setURL(data.postLink || null)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: "❌ Failed to fetch meme. Try again later." });
    }
  },
};