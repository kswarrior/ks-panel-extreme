const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Give KS Hub Credits to another user")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to give credits to").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("amount").setDescription("Amount to give").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const isOwner = interaction.user.id === config.ownerId;
    const userData = economy.getOrCreateUser(interaction.user.id);
 
    if (target.id === interaction.user.id && !isOwner) {
      return interaction.reply({ content: "❌ You can't give credits to yourself!", ephemeral: true });
    }
 
    if (target.bot) {
      return interaction.reply({ content: "❌ You can't give credits to bots!", ephemeral: true });
    }
 
    if (amount <= 0) {
      return interaction.reply({ content: "❌ You must give a positive amount!", ephemeral: true });
    }
 
    if (!isOwner && amount > userData.balance) {
      return interaction.reply({ content: "❌ You don't have enough credits!", ephemeral: true });
    }
 
    if (!isOwner) {
      economy.removeBalance(interaction.user.id, amount);
    }
    economy.addBalance(target.id, amount);

    const senderData = economy.getUser(interaction.user.id);
    const recipientData = economy.getUser(target.id);

    const embed = new EmbedBuilder()
      .setTitle("💸 Credits Given!")
      .setDescription(`You gave **${amount.toLocaleString()} KC** to ${target}!`)
      .addFields(
        { name: "Your New Balance", value: `${senderData.balance.toLocaleString()} KC`, inline: true },
        { name: "Their New Balance", value: `${recipientData.balance.toLocaleString()} KC`, inline: true }
      )
      .setColor(config.colors.success)
      .setFooter({ text: `${config.botName} | Give` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
