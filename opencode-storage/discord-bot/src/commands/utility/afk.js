const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set yourself as AFK (Away From Keyboard)")
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for being AFK").setRequired(false)
    ),

  async execute(interaction, client) {
    const reason = interaction.options.getString("reason") || "No reason provided";
    
    if (!client.afkUsers) {
      client.afkUsers = new Map();
    }

    client.afkUsers.set(interaction.user.id, {
      reason,
      timestamp: Date.now(),
      guildId: interaction.guild.id,
    });

    const embed = new EmbedBuilder()
      .setTitle("😴 AFK Status Set")
      .setDescription(`You are now AFK: ${reason}`)
      .setColor(config.colors.info)
      .setFooter({ text: `${config.botName} | AFK` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};