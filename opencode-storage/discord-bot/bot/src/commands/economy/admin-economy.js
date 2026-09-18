const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-economy")
    .setDescription("Owner only: Manage user credits")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => 
      sub.setName("set")
        .setDescription("Set a user's balance")
        .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
        .addIntegerOption(o => o.setName("amount").setDescription("Amount to set").setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName("remove")
        .setDescription("Remove credits from a user")
        .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
        .addIntegerOption(o => o.setName("amount").setDescription("Amount to remove").setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName("reset")
        .setDescription("Reset a user's balance to 0")
        .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
    ),

  async execute(interaction) {
    if (interaction.user.id !== config.ownerId) {
      return interaction.reply({ content: "❌ This command is reserved for the bot owner!", ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    if (subcommand === "set") {
      economy.setBalance(target.id, amount);
    } else if (subcommand === "remove") {
      // Note: removeBalance usually checks for funds, we'll use setBalance for admin override
      const user = economy.getUser(target.id) || { balance: 0 };
      economy.setBalance(target.id, Math.max(0, user.balance - amount));
    } else if (subcommand === "reset") {
      economy.setBalance(target.id, 0);
    }

    const updatedUser = economy.getUser(target.id);
    const embed = new EmbedBuilder()
      .setTitle("🛠️ Economy Admin")
      .setDescription(`Successfully updated balance for ${target}!`)
      .addFields({ name: "New Balance", value: `${updatedUser.balance.toLocaleString()} KC` })
      .setColor(config.colors.primary)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
