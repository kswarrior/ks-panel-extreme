const { SlashCommandBuilder } = require("discord.js");
const { buildCard } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("howtoearn")
    .setDescription("Learn how to earn KS Hub Credits"),

  async execute(interaction) {
    const card = buildCard({
      title: "💰 How to Earn Credits",
      description: "There are several ways to grow your wealth in KS Hub. Here are the available methods:",
      theme: "economy",
      grid: false,
      fields: [
        { name: "📅 Daily Reward", value: "Use `/daily` to claim your free credits every 24 hours." },
        { name: "🛠️ Work", value: "Use `/work` to simulate a job and earn a random amount of KC." },
        { name: "🙏 Beg", value: "Use `/beg` to try and get some spare change from strangers." },
        { name: "🎲 Casino Games", value: "Try `/coinflip`, `/slots`, or `/blackjack` to gamble your credits!" },
        { name: "💸 Gifts", value: "Other users can send you credits using the `/give` command." },
        { name: "📈 Trading", value: "Buy items from the `/buy` shop and build your luxury collection." },
      ],
    });

    await interaction.reply({ embeds: [card] });
  },
};
