const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rob")
    .setDescription("Attempt to rob another user")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to rob").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    
    if (target.id === interaction.user.id) {
      return interaction.reply({ content: "❌ You can't rob yourself!", ephemeral: true });
    }

    if (target.bot) {
      return interaction.reply({ content: "❌ You can't rob bots!", ephemeral: true });
    }

    const targetData = economy.getUser(target.id);
    if (!targetData || targetData.balance < 50) {
      return interaction.reply({ content: "❌ This user doesn't have enough credits to rob!", ephemeral: true });
    }

    const userData = economy.getOrCreateUser(interaction.user.id);
    const now = Date.now();

    const COOLDOWN = 2 * 60 * 60 * 1000;

    if (userData.lastRob && now - userData.lastRob < COOLDOWN) {
      const remaining = COOLDOWN - (now - userData.lastRob);
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

      const embed = new EmbedBuilder()
        .setTitle("⏰ Rob Cooldown")
        .setDescription(`You've robbed recently. Lay low for a while!`)
        .addFields({ name: "Try again in", value: `${hours}h ${minutes}m`, inline: true })
        .setColor(config.colors.warning)
        .setFooter({ text: `${config.botName} | Rob` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    economy.setCooldown(interaction.user.id, "lastRob", now);

    const success = Math.random() > 0.5;
    const stolenAmount = success ? Math.floor(Math.random() * 100) + 50 : 0;
    const fineAmount = success ? 0 : Math.floor(Math.random() * 50) + 25;

    if (success) {
      const actualStolen = Math.min(stolenAmount, targetData.balance);
      economy.removeBalance(target.id, actualStolen);
      const newBalance = economy.addBalance(interaction.user.id, actualStolen);

      const embed = new EmbedBuilder()
        .setTitle("🎉 Robbery Successful!")
        .setDescription(`You successfully robbed ${target} and stole **${actualStolen.toLocaleString()} KC**!`)
        .addFields(
          { name: "Stolen", value: `${actualStolen.toLocaleString()} KC`, inline: true },
          { name: "New Balance", value: `${newBalance.toLocaleString()} KC`, inline: true }
        )
        .setColor(config.colors.success)
        .setFooter({ text: `${config.botName} | Rob` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else {
      const fineResult = economy.removeBalance(interaction.user.id, fineAmount);
      const newBalance = fineResult === -1 ? 0 : fineResult;

      const embed = new EmbedBuilder()
        .setTitle("❌ Robbery Failed!")
        .setDescription(`You tried to rob ${target} but got caught! You paid **${fineAmount.toLocaleString()} KC** as a fine.`)
        .addFields(
          { name: "Fine", value: `${fineAmount.toLocaleString()} KC`, inline: true },
          { name: "New Balance", value: `${newBalance.toLocaleString()} KC`, inline: true }
        )
        .setColor(config.colors.error)
        .setFooter({ text: `${config.botName} | Rob` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
