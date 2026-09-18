const { SlashCommandBuilder } = require("discord.js");
const { buildCard } = require("../../utils/embed");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another user's balance")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check balance for").setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const userData = economy.getUser(user.id);
    const avatar = user.displayAvatarURL({ dynamic: true, size: 256 });

    const card = buildCard({
      title: "💰 KS Hub Credits",
      description: userData ? `Detailed balance for ${user}` : `${user} hasn't earned any credits yet!`,
      theme: userData ? "economy" : "info",
      thumbnail: avatar,
      grid: true,
      perRow: 2,
      fields: [
        { name: "Current Balance", value: `${(userData?.balance ?? 0).toLocaleString()} KC` },
        { name: "Lifetime Earnings", value: `${(userData?.totalEarned ?? 0).toLocaleString()} KC` },
        { name: "Total Spending", value: `${(userData?.totalSpent ?? 0).toLocaleString()} KC` },
        { name: "Net Worth", value: `${((userData?.balance ?? 0) + (userData?.totalEarned ?? 0)).toLocaleString()} KC` },
      ],
    });

    await interaction.reply({ embeds: [card] });
  },
};
