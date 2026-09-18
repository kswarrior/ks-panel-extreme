const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { modEmbed, errorEmbed, successEmbed } = require("../../utils/embed");
const { ban: banUser } = require("./ban");
const { warn } = require("./warn");

const MAX_REASON = 1000;

module.exports = {
  data: new SlashCommandBuilder().setName("massban").setDescription("Ban multiple users").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName("user-ids").setDescription("Comma-separated user IDs").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
    .addIntegerOption((o) => o.setName("delete-days").setDescription("Days of messages to delete (0-7)").setMinValue(0).setMaxValue(7).setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const rawIds = interaction.options.getString("user-ids");
    const reason = interaction.options.getString("reason") || "No reason provided";
    const deleteDays = interaction.options.getInteger("delete-days") || 0;
    const me = interaction.guild.members.me;

    if (!me.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.editReply({ embeds: [errorEmbed("Missing Permission", "I need the Ban Members permission.")] });
    }

    const ids = rawIds.split(",").map((s) => s.trim()).filter(Boolean).filter((id) => /^\d{17,20}$/.test(id));
    if (!ids.length) return interaction.editReply({ embeds: [errorEmbed("Invalid Input", "Provide a comma-separated list of 17–20 digit user IDs.")],
      ephemeral: true });

    if (ids.length > 50) return interaction.editReply({ embeds: [errorEmbed("Too Many", "Maximum 50 users per mass-ban.")], ephemeral: true });

    const banned = [];
    const failed = [];
    for (const userId of ids) {
      try {
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (member && member.bannable && member.id !== interaction.guild.ownerId && !(member.roles.highest.position >= me.roles.highest.position && !me.permissions.has(PermissionFlagsBits.Administrator))) {
          await member.ban({ deleteMessageDays: Math.min(deleteDays, 7), reason: `${reason} - Mass Ban by ${interaction.user.tag}` });
        } else {
          await interaction.guild.bans.create(userId, { deleteMessageDays: Math.min(deleteDays, 7), reason: `${reason} - Mass Ban by ${interaction.user.tag}` });
        }
        banned.push(userId);
      } catch {
        failed.push(userId);
      }
    }

    const embed = new EmbedBuilder().setTitle("🔨 Mass Ban Complete").setDescription(`**Banned:** ${banned.length}\n**Failed:** ${failed.length}`).addFields({ name: "Reason", value: reason, inline: false }, { name: "Banned IDs", value: banned.join(", ") || "None", inline: false }, { name: "Failed IDs",
      value: failed.join(", ") || "None", inline: false }).setColor(failed.length > 0 ? config.colors.warning : config.colors.success).setFooter({ text: `Moderator: ${interaction.user.tag}` }).setTimestamp();

    await interaction.editReply({ embeds: [embed], ephemeral: true });
  },
};
