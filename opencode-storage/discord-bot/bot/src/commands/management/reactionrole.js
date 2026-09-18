const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const config = require("../../config");
const { successEmbed, errorEmbed, modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reactionrole")
    .setDescription("Manage reaction roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a reaction role")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel for the message").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role to assign").setRequired(true))
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji to react with").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Custom message (optional)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a reaction role")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel with the message").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption((o) => o.setName("message-id").setDescription("Message ID").setRequired(true))
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji to remove").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all reaction roles in this server")
    )
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Create a reaction role panel with multiple roles")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel for the panel").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption((o) => o.setName("title").setDescription("Panel title").setRequired(true))
        .addStringOption((o) => o.setName("description").setDescription("Panel description").setRequired(false))
        .addStringOption((o) => o.setName("color").setDescription("Embed color (hex)").setRequired(false))
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === "add") await addReactionRole(interaction, client);
    else if (sub === "remove") await removeReactionRole(interaction, client);
    else if (sub === "list") await listReactionRoles(interaction, client);
    else if (sub === "panel") await createPanel(interaction, client);
  },

  selectMenuHandlers: {
    reactionrole_select: async (interaction, client) => {
      const guildConfig = client.reactionRoles?.get(interaction.guild.id);
      if (!guildConfig) return interaction.reply({ content: "❌ No reaction roles configured.", ephemeral: true });

      const selected = interaction.values;
      const member = interaction.member;
      let added = [], removed = [];

      for (const roleId of selected) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) continue;

        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(role).catch(() => {});
          removed.push(role.name);
        } else {
          await member.roles.add(role).catch(() => {});
          added.push(role.name);
        }
      }

      let msg = "";
      if (added.length) msg += `✅ Added: ${added.join(", ")}\n`;
      if (removed.length) msg += `❌ Removed: ${removed.join(", ")}`;
      await interaction.reply({ content: msg || "No changes made.", ephemeral: true });
    },
  },

  buttonHandlers: {
    reactionrole_addrole_: async (interaction, client) => {
      const panelData = client.reactionRolePanels?.get(interaction.guild.id);
      if (!panelData) {
        return interaction.reply({ content: "❌ Panel not found. It may have expired.", ephemeral: true });
      }

      await interaction.reply({ 
        content: "To add a role, please reply to the panel message using this format:\n`role: <@&ROLE_ID> emoji: EMOJI`\n\nExample: `role: <@&123456789> emoji: 🍎`", 
        ephemeral: true 
      });
    },

    reactionrole_done_: async (interaction, client) => {
      const panelData = client.reactionRolePanels?.get(interaction.guild.id);
      if (!panelData) {
        return interaction.reply({ content: "❌ Panel not found.", ephemeral: true });
      }

      if (panelData.roles.length === 0) {
        return interaction.reply({ content: "❌ No roles added yet. Add at least one role before finishing.", ephemeral: true });
      }

      const channel = client.channels.cache.get(panelData.channelId);
      if (!channel) return interaction.reply({ content: "❌ Channel not found.", ephemeral: true });

      const options = panelData.roles.map((r) => ({
        label: r.emoji ? `${r.emoji} ${r.roleName}` : r.roleName,
        value: r.roleId,
        description: `Toggle ${r.roleName}`,
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("reactionrole_select")
        .setPlaceholder("Select roles...")
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const panelEmbed = new EmbedBuilder()
        .setTitle(panelData.title)
        .setDescription(panelData.description)
        .setColor(panelData.color)
        .setFooter({ text: `${config.botName}` })
        .setTimestamp();

      await channel.send({ embeds: [panelEmbed], components: [row] });
      await interaction.reply({ content: `✅ Panel finalized in ${channel}!`, ephemeral: true });
    },
  },
};

async function addReactionRole(interaction, client) {
  const channel = interaction.options.getChannel("channel");
  const role = interaction.options.getRole("role");
  const emoji = interaction.options.getString("emoji");
  const customMessage = interaction.options.getString("message");

  if (role.position >= interaction.guild.members.me.roles.highest.position) {
    return interaction.reply({ embeds: [errorEmbed("Role Too High", "I cannot assign a role higher than or equal to my highest role.")], ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle("🎭 Reaction Role")
    .setDescription(customMessage || `React with ${emoji} to get the **${role.name}** role!`)
    .setColor(config.colors.primary)
    .setFooter({ text: `${config.botName}` })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });
  await msg.react(emoji).catch(() => {});

  client.reactionRoles = client.reactionRoles || new Map();
  const guildRoles = client.reactionRoles.get(interaction.guild.id) || new Map();
  guildRoles.set(msg.id, { [emoji]: role.id });
  client.reactionRoles.set(interaction.guild.id, guildRoles);

  await interaction.reply({ embeds: [successEmbed("✅ Reaction Role Added", `Message: ${msg.url}\nEmoji: ${emoji}\nRole: ${role}`)], ephemeral: true });
}

async function removeReactionRole(interaction, client) {
  const channel = interaction.options.getChannel("channel");
  const messageId = interaction.options.getString("message-id");
  const emoji = interaction.options.getString("emoji");

  const guildRoles = client.reactionRoles?.get(interaction.guild.id);
  if (!guildRoles || !guildRoles.has(messageId)) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", "No reaction role found for that message.")], ephemeral: true });
  }

  const messageRoles = guildRoles.get(messageId);
  if (!messageRoles[emoji]) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", "That emoji is not configured as a reaction role.")], ephemeral: true });
  }

  delete messageRoles[emoji];
  if (Object.keys(messageRoles).length === 0) guildRoles.delete(messageId);

  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) await msg.reactions.removeAll().catch(() => {});

  await interaction.reply({ embeds: [successEmbed("✅ Removed", `Reaction role for ${emoji} removed.`)], ephemeral: true });
}

async function listReactionRoles(interaction, client) {
  const guildRoles = client.reactionRoles?.get(interaction.guild.id);
  if (!guildRoles || guildRoles.size === 0) {
    return interaction.reply({ embeds: [modEmbed("🎭 Reaction Roles", "No reaction roles configured in this server.")], ephemeral: true });
  }

  let desc = "";
  for (const [msgId, roles] of guildRoles.entries()) {
    desc += `**Message ID:** \`${msgId}\`\n`;
    for (const [emoji, roleId] of Object.entries(roles)) {
      const role = interaction.guild.roles.cache.get(roleId);
      desc += `  ${emoji} → ${role ? role.toString() : `Deleted Role (${roleId})`}\n`;
    }
    desc += "\n";
  }

  await interaction.reply({ embeds: [modEmbed("🎭 Reaction Roles", desc)], ephemeral: true });
}

async function createPanel(interaction, client) {
  const channel = interaction.options.getChannel("channel");
  const title = interaction.options.getString("title");
  const description = interaction.options.getString("description") || "Select roles from the menu below:";
  const colorStr = interaction.options.getString("color");
  const color = colorStr ? parseInt(colorStr.replace("#", ""), 16) : config.colors.primary;

  client.reactionRolePanels = client.reactionRolePanels || new Map();
  const panelData = {
    title,
    description,
    color,
    channelId: channel.id,
    roles: [],
  };

  client.reactionRolePanels.set(interaction.guild.id, panelData);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description + "\n\n*Use the buttons below to add roles, then click Done to finalize.*")
    .setColor(color)
    .setFooter({ text: `${config.botName}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reactionrole_addrole_${Date.now()}`)
      .setLabel("➕ Add Role")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reactionrole_done_${interaction.guild.id}`)
      .setLabel("✅ Done")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [successEmbed("🎭 Panel Created", `Panel created in ${channel}. Use buttons to add roles.`)], ephemeral: true });

  await channel.send({ embeds: [embed], components: [row] });
}

module.exports.handleReactionAdd = async (reaction, user, client) => {
  if (user.bot) return;
  const guildRoles = client.reactionRoles?.get(reaction.message.guild.id);
  if (!guildRoles) return;

  const messageRoles = guildRoles.get(reaction.message.id);
  if (!messageRoles) return;

  const roleId = messageRoles[reaction.emoji.name] || messageRoles[reaction.emoji.identifier];
  if (!roleId) return;

  const member = reaction.message.guild.members.cache.get(user.id);
  if (!member) return;

  const role = reaction.message.guild.roles.cache.get(roleId);
  if (role && !member.roles.cache.has(roleId)) {
    await member.roles.add(role).catch(() => {});
  }
};

module.exports.handleReactionRemove = async (reaction, user, client) => {
  if (user.bot) return;
  const guildRoles = client.reactionRoles?.get(reaction.message.guild.id);
  if (!guildRoles) return;

  const messageRoles = guildRoles.get(reaction.message.id);
  if (!messageRoles) return;

  const roleId = messageRoles[reaction.emoji.name] || messageRoles[reaction.emoji.identifier];
  if (!roleId) return;

  const member = reaction.message.guild.members.cache.get(user.id);
  if (!member) return;

  const role = reaction.message.guild.roles.cache.get(roleId);
  if (role && member.roles.cache.has(roleId)) {
    await member.roles.remove(role).catch(() => {});
  }
};
