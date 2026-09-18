const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const config = require("../../config");
const { successEmbed, errorEmbed } = require("../../utils/embed");
const security = require("../../utils/security");
const guildConfigDB = require("../../utils/database/guildconfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure the bot for your server via a form")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("welcome").setDescription("Set the welcome channel and auto-role")
    )
    .addSubcommand((sub) =>
      sub.setName("leave").setDescription("Set the leave/goodbye channel")
    )
    .addSubcommand((sub) =>
      sub.setName("boost").setDescription("Set the boost announcement channel")
    )
    .addSubcommand((sub) =>
      sub.setName("modlog").setDescription("Set the moderation log channel")
    )
    .addSubcommand((sub) =>
      sub.setName("autorole").setDescription("Set the auto-role for new members")
    )
    .addSubcommand((sub) =>
      sub.setName("view").setDescription("View current bot configuration")
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // Security: verify permissions up front (optionDefaults are set, but the
    // permission could theoretically be missing in niche setups)
    if (!security.isPrivileged(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed("Not Allowed", "You need the **Manage Server** permission to use this command.")],
        ephemeral: true,
      });
    }

    // Read-only view stays inline (no need for a modal)
    if (sub === "view") {
      return viewConfig(interaction, client);
    }

    // Subcommand -> (modalFieldLabel, needsRoleField)
    const FIELD_MODES = {
      welcome: { channelLabel: "Welcome channel (#id, mention or raw ID)", role: true, title: "Welcome System Setup" },
      leave: { channelLabel: "Leave channel (#id, mention or raw ID)", role: false, title: "Leave System Setup" },
      boost: { channelLabel: "Boost channel (#id, mention or raw ID)", role: false, title: "Boost System Setup" },
      modlog: { channelLabel: "Mod log channel (#id, mention or raw ID)", role: false, title: "Mod Log Setup" },
      autorole: { channelLabel: null, role: true, title: "Auto-Role Setup" },
    };

    const mode = FIELD_MODES[sub];
    if (!mode) {
      return interaction.reply({ content: "❌ Unknown setup option.", ephemeral: true });
    }

    const modalId = `setup_modal:${sub}:${interaction.guild.id}`;
    const modal = new ModalBuilder().setCustomId(modalId).setTitle(mode.title);

    const rows = [];

    if (mode.channelLabel) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("setup_channel")
            .setLabel(mode.channelLabel)
            .setPlaceholder("#announcements")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(security.LIMITS.CHANNEL_ID)
            .setRequired(true)
        )
      );
    }

    if (mode.role) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("setup_role")
            .setLabel("Role ID or mention (leave empty to disable)")
            .setPlaceholder("@Member")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(security.LIMITS.ROLE_ID)
            .setRequired(false)
        )
      );
    }

    modal.addComponents(rows);
    await interaction.showModal(modal);
  },

  modalHandlers: {
    // Prefix handler: matches setup_modal:welcome:<guild>, etc.
    "setup_modal:": async (interaction, client) => {
      // Security re-check on submit
      if (!security.isPrivileged(interaction.member)) {
        return interaction.reply({
          content: "❌ You do not have permission to reconfigure the bot.",
          ephemeral: true,
        });
      }

      const [, sub, guildId] = interaction.customId.split(":");
      if (interaction.guild.id !== guildId) {
        return interaction.reply({ content: "❌ Guild mismatch.", ephemeral: true });
      }

      const channelRaw = (interaction.fields.getTextInputValue("setup_channel") || "").trim();
      const roleRaw = (interaction.fields.getTextInputValue("setup_role") || "").trim();

      client.guildConfig = client.guildConfig || new Map();
      const gc = guildConfigDB.get(interaction.guild.id) || {};
      const save = () => {
        guildConfigDB.set(interaction.guild.id, gc);
        client.guildConfig.set(interaction.guild.id, gc);
      };

      // Validate channel (required for non-autorole subs)
      let channel = null;
      if (sub !== "autorole") {
        const channelId = security.parseChannelId(channelRaw);
        if (!channelId) {
          return interaction.reply({ content: "❌ Invalid channel. Use a channel mention or raw ID.", ephemeral: true });
        }
        channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
          return interaction.reply({ content: "❌ That channel does not exist or is not a text channel.", ephemeral: true });
        }
        if (!channel.viewable) {
          return interaction.reply({ content: "❌ I cannot see that channel. Make sure I have access.", ephemeral: true });
        }
      }

      // Validate role (optional)
      let role = null;
      if (roleRaw) {
        const roleId = security.parseRoleId(roleRaw);
        if (!roleId) {
          return interaction.reply({ content: "❌ Invalid role. Use a role mention or raw ID.", ephemeral: true });
        }
        role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          return interaction.reply({ content: "❌ That role does not exist.", ephemeral: true });
        }
        // Security: do not allow assigning a role higher than the bot's highest role
        const botMember = interaction.guild.members.me;
        if (!botMember.roles.highest.comparePositionTo(role) > 0 && interaction.guild.ownerId !== interaction.user.id) {
          return interaction.reply({
            content: "❌ That role is higher than or equal to my highest role, so I cannot assign it.",
            ephemeral: true,
          });
        }
        // Security: warn about dangerous roles (Admin / everyone)
        if (role.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: "❌ For safety, I cannot auto-assign a role with Administrator permission.",
            ephemeral: true,
          });
        }
      }

      // Apply per subcommand
      if (sub === "welcome") {
        gc.welcomeChannelId = channel.id;
        if (role) gc.autoRoleId = role.id;
        save();
        return interaction.reply({
          embeds: [successEmbed("Welcome System Configured", `Welcome channel: ${channel}${role ? `\nAuto-role: ${role}` : ""}`)],
          ephemeral: true,
        });
      }

      if (sub === "leave") {
        gc.leaveChannelId = channel.id;
        save();
        return interaction.reply({
          embeds: [successEmbed("Leave System Configured", `Leave channel: ${channel}`)],
          ephemeral: true,
        });
      }

      if (sub === "boost") {
        gc.boostChannelId = channel.id;
        save();
        return interaction.reply({
          embeds: [successEmbed("Boost System Configured", `Boost announcements: ${channel}`)],
          ephemeral: true,
        });
      }

      if (sub === "modlog") {
        gc.modLogChannelId = channel.id;
        save();
        return interaction.reply({
          embeds: [successEmbed("Mod Log Configured", `Mod log channel: ${channel}`)],
          ephemeral: true,
        });
      }

      if (sub === "autorole") {
        if (!role) {
          return interaction.reply({ content: "❌ A role is required for the autorole setup.", ephemeral: true });
        }
        gc.autoRoleId = role.id;
        save();
        return interaction.reply({
          embeds: [successEmbed("Auto-Role Configured", `New members will receive: ${role}`)],
          ephemeral: true,
        });
      }

      return interaction.reply({ content: "❌ Unknown setup option.", ephemeral: true });
    },
  },
};

async function viewConfig(interaction, client) {
  const gc = guildConfigDB.get(interaction.guild.id) || {};
  const ch = (id) => (id ? `<#${id}>` : "Not set");
  const rl = (id) => (id ? `<@&${id}>` : "Not set");

  const embed = new EmbedBuilder()
    .setTitle("Bot Configuration")
    .setColor(config.colors.info)
    .addFields(
      { name: "Welcome Channel", value: ch(gc.welcomeChannelId), inline: true },
      { name: "Leave Channel", value: ch(gc.leaveChannelId), inline: true },
      { name: "Boost Channel", value: ch(gc.boostChannelId), inline: true },
      { name: "Mod Log Channel", value: ch(gc.modLogChannelId), inline: true },
      { name: "Auto-Role", value: rl(gc.autoRoleId), inline: true },
      { name: "Ticket Config", value: gc.ticketCategoryId ? "Set" : "Not set", inline: true }
    )
    .setFooter({ text: `${config.botName} | KS Hub` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
