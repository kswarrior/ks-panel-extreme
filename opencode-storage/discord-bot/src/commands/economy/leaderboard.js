const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the top KS Hub Credits earners"),

  async execute(interaction) {
    const allUsers = economy.getAllUsers();
    
    const sorted = allUsers.sort((a, b) => b.balance - a.balance).slice(0, 10);

    if (sorted.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("🏆 KS Hub Credits Leaderboard")
        .setDescription("No users have earned credits yet! Be the first!")
        .setColor(config.colors.info)
        .setFooter({ text: `${config.botName} | Leaderboard` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

    const leaderboard = sorted.map((user, i) => {
      const userId = user.userId;
      const balance = user.balance.toLocaleString();
      return `${medals[i]} <@${userId}> — \`${balance} KC\``;
    }).join("\n");
 
    const userRank = sorted.findIndex((u) => u.userId === interaction.user.id) + 1;
 
    const embed = new EmbedBuilder()
      .setTitle("🏆 KS Hub Credits Leaderboard")
      .setDescription(`**Top 10 Wealthiest Members**\n\n${leaderboard}`)
      .addFields({ name: "Your Standing", value: userRank > 0 ? `Rank: **#${userRank}**` : "Not in top 10", inline: true })
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | Economy Rankings` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};