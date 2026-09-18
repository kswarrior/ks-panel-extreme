const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View the shop and buy items"),

  async execute(interaction) {
    const shopItems = [
      { id: "car", name: "🚗 Car", price: 5000, description: "A fancy car" },
      { id: "house", name: "🏠 House", price: 10000, description: "A beautiful house" },
      { id: "phone", name: "📱 Phone", price: 1000, description: "Latest smartphone" },
      { id: "laptop", name: "💻 Laptop", price: 2500, description: "High-end laptop" },
      { id: "watch", name: "⌚ Watch", price: 3000, description: "Luxury watch" },
      { id: "bike", name: "🚴 Bike", price: 800, description: "Mountain bike" },
      { id: "tv", name: "📺 TV", price: 1500, description: "Smart TV" },
      { id: "camera", name: "📷 Camera", price: 2000, description: "Professional camera" },
    ];

    const userData = economy.getUser(interaction.user.id);
    const balance = userData ? userData.balance : 0;

    const embed = new EmbedBuilder()
      .setTitle("🛒 KS Hub Shop")
      .setDescription("Use `/buy <item>` to purchase items!")
      .addFields(
        shopItems.map((item) => ({
          name: item.name,
          value: `${item.description}\n**Price:** ${item.price.toLocaleString()} KC`,
          inline: true,
        }))
      )
      .addFields({ name: "Your Balance", value: `${balance.toLocaleString()} KC`, inline: false })
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | Shop` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};