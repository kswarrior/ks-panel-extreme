const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { successEmbed, errorEmbed } = require("../../utils/embed");

const BULK_DELETE_LIMIT = 1209600000; // 14 days in ms (Discord's hard limit for bulkDelete)

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear messages from a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user").setRequired(false)),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const userOption = interaction.options.getUser("user");

    await interaction.deferReply({ ephemeral: true });

    try {
      // Always fetch more than asked for to account for pinned/system messages that can't be bulk-deleted
      const fetched = await interaction.channel.messages.fetch({ limit: 100 });

      let candidates = fetched;
      if (userOption) {
        candidates = candidates.filter((m) => m.author.id === userOption.id);
      }

      // Partition into: recent (can bulkDelete) vs old (must delete-individually)
      const now = Date.now();
      const recent = [];
      const old = [];
      for (const m of candidates.values()) {
        if (now - m.createdTimestamp < BULK_DELETE_LIMIT) recent.push(m);
        else old.push(m);
      }

      // bulkDelete: max 100 per call, Discord auto-skips pinned / >14d / non-deletable
      const toBulk = recent.slice(0, amount);
      let bulkDeletedCount = 0;
      if (toBulk.length > 0) {
        const bulkResult = await interaction.channel.bulkDelete(toBulk, true);
        bulkDeletedCount = bulkResult.size;
      }

      // Fill remaining quota by deleting old messages individually (only if user didn't specify filter)
      let individuallyDeleted = 0;
      const remainingQuota = amount - bulkDeletedCount;
      if (remainingQuota > 0 && old.length > 0) {
        for (const m of old) {
          if (individuallyDeleted >= remainingQuota) break;
          try {
            await m.delete();
            individuallyDeleted++;
          } catch {
            // Skip messages we can't delete (system, pinned without perms, already gone)
          }
        }
      }

      const totalDeleted = bulkDeletedCount + individuallyDeleted;
      const userLabel = userOption ? ` from <@${userOption.id}>` : "";

      if (totalDeleted === 0) {
        return interaction.editReply({ embeds: [errorEmbed("Nothing Deleted", "No messages matched or they were too old/pinned to delete.")] });
      }

      await interaction.editReply({ embeds: [successEmbed("🧹 Messages Cleared", `Deleted **${totalDeleted}** message(s)${userLabel}.`)] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed("Error", `Failed to clear messages: ${err.message}`)] });
    }
  },
};
