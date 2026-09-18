const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remindme")
    .setDescription("Set a reminder for yourself")
    .addStringOption((o) =>
      o.setName("time").setDescription("Time until reminder (e.g., 10m, 1h, 1d)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reminder").setDescription("What to remind me about").setRequired(true)
    ),

  async execute(interaction) {
    const timeStr = interaction.options.getString("time");
    const reminder = interaction.options.getString("reminder");

    const DURATION_REGEX = /^(\d+)([smhd])$/;
    const match = timeStr.match(DURATION_REGEX);
    
    if (!match) {
      return interaction.reply({ content: "❌ Invalid time format. Use: 10s, 10m, 1h, or 1d" });
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    const ms = value * (unit === "s" ? 1000 : unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000);

    const endTime = Date.now() + ms;
    const endTimestamp = Math.floor(endTime / 1000);

    const embed = new EmbedBuilder()
      .setTitle("⏰ Reminder Set")
      .setDescription(`**Reminder:** ${reminder}\n**Time:** ${timeStr}\n**When:** <t:${endTimestamp}:R> (<t:${endTimestamp}:F>)`)
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName} | Reminder` })
      .setTimestamp(new Date(endTime));

    await interaction.reply({ embeds: [embed] });

    setTimeout(async () => {
      try {
        await interaction.user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔔 Reminder!")
              .setDescription(reminder)
              .setColor(config.colors.primary)
              .setFooter({ text: `${config.botName} | Reminder` })
              .setTimestamp()
          ]
        });
      } catch (error) {
        console.error("Could not send reminder DM:", error);
      }
    }, ms);
  },
};