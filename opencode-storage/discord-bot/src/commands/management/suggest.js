const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion for the server")
    .addStringOption((o) => o.setName("suggestion").setDescription("Your suggestion").setRequired(true)),

  async execute(interaction, client) {
    const suggestion = interaction.options.getString("suggestion");

    const guildConfig = client.guildConfig?.get(interaction.guild.id);
    let suggestChannel = guildConfig?.suggestChannelId
      ? interaction.guild.channels.cache.get(guildConfig.suggestChannelId)
      : interaction.guild.channels.cache.find((c) => /suggestion/i.test(c.name));

    if (!suggestChannel) suggestChannel = interaction.channel;

    const embed = new EmbedBuilder()
      .setTitle("New Suggestion")
      .setDescription(suggestion)
      .setColor(config.colors.info)
      .addFields(
        { name: "Suggested By", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Status", value: "Pending", inline: true }
      )
      .setFooter({ text: `Suggestion #${Date.now().toString(36)}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("suggest_up").setLabel("👍 Upvote").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("suggest_down").setLabel("👎 Downvote").setStyle(ButtonStyle.Danger)
    );

    const msg = await suggestChannel.send({ embeds: [embed], components: [row] });
    await msg.react("👍").catch(() => {});
    await msg.react("👎").catch(() => {});

    await interaction.reply({ content: `✅ Suggestion submitted in ${suggestChannel}!`, ephemeral: true });
  },

  buttonHandlers: {
    suggest_up: async (interaction, client) => {
      await interaction.reply({ content: "👍 Vote recorded!", ephemeral: true });
    },
    suggest_down: async (interaction, client) => {
      await interaction.reply({ content: "👎 Vote recorded!", ephemeral: true });
    },
  },
};
