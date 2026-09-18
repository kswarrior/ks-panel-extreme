const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the bot invite link and server invite info"),

  async execute(interaction, client) {
    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=8&scope=bot%20applications.commands`;

    const embed = new EmbedBuilder()
      .setTitle("Invite KS Bot")
      .setDescription(`Add KS Bot to your server using the link below!`)
      .setColor(config.colors.primary)
      .addFields(
        { name: "Bot Invite", value: `[Click Here](${inviteLink})`, inline: true },
        { name: "Support Server", value: "KS Hub", inline: true },
        { name: "Bot ID", value: client.user.id, inline: true }
      )
      .setFooter({ text: `${config.botName} | Made by ${config.ownerName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};