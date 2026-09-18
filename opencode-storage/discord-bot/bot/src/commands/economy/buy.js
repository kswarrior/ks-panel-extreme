const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy an item from the shop")
    .addStringOption((o) =>
      o.setName("item").setDescription("Item to buy").setRequired(true)
        .addChoices(
          { name: "🚗 Car", value: "car" },
          { name: "🏠 House", value: "house" },
          { name: "📱 Phone", value: "phone" },
          { name: "💻 Laptop", value: "laptop" },
          { name: "⌚ Watch", value: "watch" },
          { name: "🚴 Bike", value: "bike" },
          { name: "📺 TV", value: "tv" },
          { name: "📷 Camera", value: "camera" }
        )
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("User to buy for (Owner only)").setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const itemChoice = interaction.options.getString("item");
    const isOwner = economy.isOwner(interaction.user.id);
    
    if (targetUser.id !== interaction.user.id && !isOwner) {
      return interaction.reply({ content: "❌ You can only buy items for yourself!", ephemeral: true });
    }
    
    const shopItems = {
      car: { name: "🚗 Car", price: 5000 },
      house: { name: "🏠 House", price: 10000 },
      phone: { name: "📱 Phone", price: 1000 },
      laptop: { name: "💻 Laptop", price: 2500 },
      watch: { name: "⌚ Watch", price: 3000 },
      bike: { name: "🚴 Bike", price: 800 },
      tv: { name: "📺 TV", price: 1500 },
      camera: { name: "📷 Camera", price: 2000 },
    };
 
    const item = shopItems[itemChoice];
    if (!item) {
      return interaction.reply({ content: "❌ Invalid item!", ephemeral: true });
    }
 
    const userData = economy.getOrCreateUser(targetUser.id);
 
    if (!isOwner && userData.balance < item.price) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Insufficient Funds")
        .setDescription(`${targetUser.username} needs **${item.price.toLocaleString()} KC** but only has **${userData.balance.toLocaleString()} KC**.`)
        .setColor(config.colors.error)
        .setFooter({ text: `${config.botName} | Shop` })
        .setTimestamp();
 
      return interaction.reply({ embeds: [embed] });
    }
 
    if (economy.hasItem(targetUser.id, itemChoice)) {
      return interaction.reply({ content: `❌ ${targetUser.username} already owns this item!`, ephemeral: true });
    }
 
    const removalResult = economy.removeBalance(targetUser.id, item.price);
    if (removalResult === -1) {
      return interaction.reply({ content: "❌ Insufficient funds after recheck.", ephemeral: true });
    }
    economy.addItem(targetUser.id, itemChoice);
 
    const updatedData = economy.getUser(targetUser.id);
 
    const embed = new EmbedBuilder()
      .setTitle("✅ Purchase Successful!")
      .setDescription(`${isOwner && targetUser.id !== interaction.user.id ? `You bought ${item.name} for ${targetUser}!` : `You bought ${item.name}!`} \nCost: **${item.price.toLocaleString()} KC**`)
      .addFields({ name: `${targetUser.username}'s New Balance`, value: `${updatedData.balance.toLocaleString()} KC`, inline: true })
      .setColor(config.colors.success)
      .setFooter({ text: `${config.botName} | Shop` })
      .setTimestamp();
 
    await interaction.reply({ embeds: [embed] });
  },
};
