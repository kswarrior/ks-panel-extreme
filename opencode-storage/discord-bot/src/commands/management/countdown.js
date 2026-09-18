const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("countdown")
    .setDescription("Create a countdown timer")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("duration").setDescription("Duration (e.g., 10s, 5m, 1h)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("message").setDescription("Message to display").setRequired(false)
    ),

  async execute(interaction) {
    const durationStr = interaction.options.getString("duration");
    const message = interaction.options.getString("message") || "Countdown Complete!";

    const DURATION_REGEX = /^(\d+)([smh])$/;
    const match = durationStr.match(DURATION_REGEX);
    
    if (!match) {
      return interaction.reply({ content: "❌ Invalid duration format. Use: 10s, 5m, or 1h" });
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    const ms = value * (unit === "s" ? 1000 : unit === "m" ? 60000 : 3600000);

    const endTime = Date.now() + ms;
    const endTimestamp = Math.floor(endTime / 1000);

    const embed = new EmbedBuilder()
      .setTitle("⏳ Countdown Started")
      .setDescription(`**Duration:** ${durationStr}\n**Ends:** <t:${endTimestamp}:R>\n\n**Message:** ${message}`)
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName} | Countdown` })
      .setTimestamp(new Date(endTime));

    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });

    const updateInterval = setInterval(async () => {
      const remaining = endTime - Date.now();
      
      if (remaining <= 0) {
        clearInterval(updateInterval);
        const finalEmbed = new EmbedBuilder()
          .setTitle("🎉 Countdown Complete!")
          .setDescription(message)
          .setColor(config.colors.success)
          .setTimestamp();
        
        try {
          await msg.edit({ embeds: [finalEmbed] });
        } catch (e) {}
        return;
      }

      const remainingSecs = Math.floor(remaining / 1000);
      const minutes = Math.floor(remainingSecs / 60);
      const seconds = remainingSecs % 60;

      const updatingEmbed = new EmbedBuilder()
        .setTitle("⏳ Countdown in Progress")
        .setDescription(`**Remaining:** ${minutes}m ${seconds}s\n**Ends:** <t:${endTimestamp}:R>\n\n**Message:** ${message}`)
        .setColor(config.colors.info)
        .setFooter({ text: `${config.botName} | Countdown` })
        .setTimestamp(new Date(endTime));

      try {
        await msg.edit({ embeds: [updatingEmbed] });
      } catch (e) {
        clearInterval(updateInterval);
      }
    }, 1000);

    setTimeout(() => clearInterval(updateInterval), ms + 1000);
  },
};