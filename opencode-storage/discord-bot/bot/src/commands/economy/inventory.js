const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory"),

  async execute(interaction) {
    const userData = economy.getUser(interaction.user.id);

    if (!userData || userData.inventory.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("🎒 Inventory")
        .setDescription("You don't own any items yet! Visit `/shop` to buy items.")
        .setColor(config.colors.info)
        .setFooter({ text: `${config.botName} | Inventory` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    const itemNames = {
      car: "🚗 Car",
      house: "🏠 House",
      phone: "📱 Phone",
      laptop: "💻 Laptop",
      watch: "⌚ Watch",
      bike: "🚴 Bike",
      tv: "📺 TV",
      camera: "📷 Camera",
    };

    const inventoryList = userData.inventory
      .map((item) => `${itemNames[item.id] || item.id} x${item.quantity}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🎒 Your Inventory")
      .setDescription(inventoryList)
      .setColor(config.colors.primary)
      .setFooter({ text: `${config.botName} | Inventory` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};