const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder")
    .addStringOption((o) => o.setName("message").setDescription("What to remind you about").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("When to remind (e.g. 10m, 1h, 1d)").setRequired(true)),

  async execute(interaction, client) {
    const message = interaction.options.getString("message");
    const durationStr = interaction.options.getString("duration");

    const match = durationStr.match(/^(\d+)([smhd])$/);
    if (!match) return interaction.reply({ content: "Invalid duration. Use format: `10m`, `1h`, `1d`", ephemeral: true });

    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = value * multipliers[unit];

    if (ms > 2592000000) return interaction.reply({ content: "Reminder cannot exceed 30 days.", ephemeral: true });

    const endTime = Math.floor((Date.now() + ms) / 1000);

    const embed = new EmbedBuilder()
      .setTitle("⏰ Reminder Set")
      .setDescription(`**Message:** ${message}\n**Reminds you:** <t:${endTime}:R>`)
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    setTimeout(async () => {
      const dmEmbed = new EmbedBuilder()
        .setTitle("⏰ Reminder!")
        .setDescription(message)
        .setColor(config.colors.warning)
        .setFooter({ text: `From ${config.botName}` })
        .setTimestamp();

      await interaction.user.send({ embeds: [dmEmbed] }).catch(() => {});
    }, ms);
  },
};