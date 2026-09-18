const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { successEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete multiple messages at once")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o.setName("amount").setDescription("Number of messages to delete (2-100)").setRequired(true).setMinValue(2).setMaxValue(100)
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("Only delete messages from this user").setRequired(false)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const user = interaction.options.getUser("user");

    await interaction.deferReply({ ephemeral: true });

    const messages = await interaction.channel.messages.fetch({ limit: amount });
    let toDelete = messages;

    if (user) {
      toDelete = messages.filter((m) => m.author.id === user.id);
    }

    if (toDelete.size === 0) {
      return interaction.followUp({ content: "❌ No messages found to delete.", ephemeral: true });
    }

    const deleted = await interaction.channel.bulkDelete(toDelete, true);
    
    await interaction.followUp({ 
      embeds: [successEmbed("🗑️ Messages Purged", `Deleted ${deleted.size} message(s)`)], 
      ephemeral: true 
    });
  },
};