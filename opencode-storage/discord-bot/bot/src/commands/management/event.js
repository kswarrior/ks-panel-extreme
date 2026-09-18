const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create and manage server events")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new event")
        .addStringOption((o) => o.setName("name").setDescription("Event name").setRequired(true))
        .addStringOption((o) => o.setName("description").setDescription("Event description").setRequired(true))
        .addStringOption((o) => o.setName("start-time").setDescription("Start time (YYYY-MM-DD HH:MM)").setRequired(true))
        .addStringOption((o) => o.setName("end-time").setDescription("End time (YYYY-MM-DD HH:MM)").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all scheduled events")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const name = interaction.options.getString("name");
      const description = interaction.options.getString("description");
      const startTimeStr = interaction.options.getString("start-time");
      const endTimeStr = interaction.options.getString("end-time");

      const startTime = new Date(startTimeStr);
      const endTime = new Date(endTimeStr);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return interaction.reply({ content: "❌ Invalid date format. Use: YYYY-MM-DD HH:MM" });
      }

      if (startTime >= endTime) {
        return interaction.reply({ content: "❌ End time must be after start time." });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📅 Event: ${name}`)
        .setDescription(description)
        .addFields(
          { name: "Start Time", value: `<t:${Math.floor(startTime.getTime() / 1000)}:F>`, inline: true },
          { name: "End Time", value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>`, inline: true },
          { name: "Created by", value: interaction.user.toString(), inline: true }
        )
        .setColor(config.colors.primary)
        .setFooter({ text: `${config.botName} | Event` })
        .setTimestamp(startTime);

      await interaction.reply({ embeds: [embed] });
    } else if (sub === "list") {
      const embed = new EmbedBuilder()
        .setTitle("📅 Scheduled Events")
        .setDescription("No events scheduled. Use `/event create` to add one.")
        .setColor(config.colors.info)
        .setFooter({ text: `${config.botName} | Events` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};