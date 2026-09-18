const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder } = require("discord.js");
const config = require("../../config");
const { successEmbed, errorEmbed, modEmbed, infoEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("welcomesystem")
    .setDescription("Configure welcome, leave, and boost messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("welcome")
        .setDescription("Configure welcome messages")
        .addChannelOption((o) => o.setName("channel").setDescription("Welcome channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Welcome message (use placeholders like {user}, {display_name}, {server}, etc)").setRequired(false))
        .addStringOption((o) => o.setName("title").setDescription("Embed title").setRequired(false))
        .addStringOption((o) => o.setName("color").setDescription("Embed color (hex)").setRequired(false))
        .addStringOption((o) => o.setName("image").setDescription("Image URL for welcome embed").setRequired(false))
        .addStringOption((o) => o.setName("thumbnail").setDescription("Thumbnail URL (use {user.avatar})").setRequired(false))
        .addBooleanOption((o) => o.setName("dm").setDescription("Also DM the welcome message").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("leave")
        .setDescription("Configure leave messages")
        .addChannelOption((o) => o.setName("channel").setDescription("Leave channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Leave message (use {user} {user.tag} {server} {membercount} {account_age} etc)").setRequired(false))
        .addStringOption((o) => o.setName("title").setDescription("Embed title").setRequired(false))
        .addStringOption((o) => o.setName("color").setDescription("Embed color (hex)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("boost")
        .setDescription("Configure server boost messages")
        .addChannelOption((o) => o.setName("channel").setDescription("Boost channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Boost message (use {user} {user.tag} {server} {boostcount} {boosttier} etc)").setRequired(false))
        .addStringOption((o) => o.setName("title").setDescription("Embed title").setRequired(false))
        .addStringOption((o) => o.setName("color").setDescription("Embed color (hex)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("autorole")
        .setDescription("Set auto-role for new members")
        .addRoleOption((o) => o.setName("role").setDescription("Role to give new members").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable a welcome/leave/boost system")
        .addStringOption((o) =>
          o.setName("type").setDescription("System to disable").setRequired(true)
            .addChoices(
              { name: "Welcome", value: "welcome" },
              { name: "Leave", value: "leave" },
              { name: "Boost", value: "boost" },
              { name: "AutoRole", value: "autorole" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("preview")
        .setDescription("Preview welcome/leave/boost message")
        .addStringOption((o) =>
          o.setName("type").setDescription("Type to preview").setRequired(true)
            .addChoices(
              { name: "Welcome", value: "welcome" },
              { name: "Leave", value: "leave" },
              { name: "Boost", value: "boost" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show current welcome/leave/boost configuration")
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === "welcome") await setupWelcome(interaction, client);
    else if (sub === "leave") await setupLeave(interaction, client);
    else if (sub === "boost") await setupBoost(interaction, client);
    else if (sub === "autorole") await setupAutoRole(interaction, client);
    else if (sub === "disable") await disableSystem(interaction, client);
    else if (sub === "preview") await previewMessage(interaction, client);
    else if (sub === "show") await showConfig(interaction, client);
  },

  buttonHandlers: {
    welcome_preview: async (interaction, client) => {
      const guildConfig = client.welcomeConfig?.get(interaction.guild.id);
      if (!guildConfig || !guildConfig.welcome) return interaction.reply({ content: "Welcome system not configured.", ephemeral: true });

      const embed = buildWelcomeEmbed(guildConfig.welcome, interaction.member, interaction.guild);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    },
  },
};

async function setupWelcome(interaction, client) {
  const channel = interaction.options.getChannel("channel");
  const message = interaction.options.getString("message");
  const title = interaction.options.getString("title");
  const color = interaction.options.getString("color");
  const image = interaction.options.getString("image");
  const thumbnail = interaction.options.getString("thumbnail");
  const dm = interaction.options.getBoolean("dm");

  const welcomeConfig = {
    channelId: channel.id,
    message: message || "Welcome {user} ({display_name}) to **{server}**! 🎉\nYou are member **#{membercount}**\nAccount created: {created_at}\nJoined: {joined_at}",
    title: title || "🎉 Welcome to {server}!",
    color: color ? parseInt(color.replace("#", ""), 16) : config.colors.success,
    image: image || null,
    thumbnail: thumbnail || "{user.avatar}",
    dm: dm || false,
  };

  client.welcomeConfig = client.welcomeConfig || new Map();
  const guildConfig = client.welcomeConfig.get(interaction.guild.id) || {};
  guildConfig.welcome = welcomeConfig;
  client.welcomeConfig.set(interaction.guild.id, guildConfig);

  await interaction.reply({ embeds: [successEmbed("✅ Welcome System Configured", `Channel: ${channel}\nTitle: ${welcomeConfig.title}\nMessage: ${welcomeConfig.message}\nDM: ${welcomeConfig.dm ? "Enabled" : "Disabled"}`)], ephemeral: true });
}

async function setupLeave(interaction, client) {
  const channel = interaction.options.getChannel("channel");
  const message = interaction.options.getString("message");
  const title = interaction.options.getString("title");
  const color = interaction.options.getString("color");

  const leaveConfig = {
    channelId: channel.id,
    message: message || "{user} has left **{server}**.\nWe're now at **{membercount}** members.",
    title: title || "👋 Goodbye!",
    color: color ? parseInt(color.replace("#", ""), 16) : config.colors.error,
  };

  client.welcomeConfig = client.welcomeConfig || new Map();
  const guildConfig = client.welcomeConfig.get(interaction.guild.id) || {};
  guildConfig.leave = leaveConfig;
  client.welcomeConfig.set(interaction.guild.id, guildConfig);

  await interaction.reply({ embeds: [successEmbed("✅ Leave System Configured", `Channel: ${channel}\nTitle: ${leaveConfig.title}\nMessage: ${leaveConfig.message}`)], ephemeral: true });
}

async function setupBoost(interaction, client) {
  const channel = interaction.options.getChannel("channel");
  const message = interaction.options.getString("message");
  const title = interaction.options.getString("title");
  const color = interaction.options.getString("color");

  const boostConfig = {
    channelId: channel.id,
    message: message || "🎉 {user} just boosted **{server}**!\nTotal boosts: **{boostcount}** ⚡",
    title: title || "⚡ Server Boost!",
    color: color ? parseInt(color.replace("#", ""), 16) : 0xf47fff,
  };

  client.welcomeConfig = client.welcomeConfig || new Map();
  const guildConfig = client.welcomeConfig.get(interaction.guild.id) || {};
  guildConfig.boost = boostConfig;
  client.welcomeConfig.set(interaction.guild.id, guildConfig);

  await interaction.reply({ embeds: [successEmbed("✅ Boost System Configured", `Channel: ${channel}\nTitle: ${boostConfig.title}\nMessage: ${boostConfig.message}`)], ephemeral: true });
}

async function setupAutoRole(interaction, client) {
  const role = interaction.options.getRole("role");

  client.welcomeConfig = client.welcomeConfig || new Map();
  const guildConfig = client.welcomeConfig.get(interaction.guild.id) || {};
  guildConfig.autorole = role.id;
  client.welcomeConfig.set(interaction.guild.id, guildConfig);

  await interaction.reply({ embeds: [successEmbed("✅ Auto-Role Set", `New members will receive: ${role}`)], ephemeral: true });
}

async function disableSystem(interaction, client) {
  const type = interaction.options.getString("type");

  client.welcomeConfig = client.welcomeConfig || new Map();
  const guildConfig = client.welcomeConfig.get(interaction.guild.id) || {};

  if (type === "welcome") delete guildConfig.welcome;
  else if (type === "leave") delete guildConfig.leave;
  else if (type === "boost") delete guildConfig.boost;
  else if (type === "autorole") delete guildConfig.autorole;

  if (Object.keys(guildConfig).length === 0) client.welcomeConfig.delete(interaction.guild.id);
  else client.welcomeConfig.set(interaction.guild.id, guildConfig);

  await interaction.reply({ embeds: [successEmbed("✅ Disabled", `${type} system has been disabled.`)], ephemeral: true });
}

async function previewMessage(interaction, client) {
  const type = interaction.options.getString("type");
  const guildConfig = client.welcomeConfig?.get(interaction.guild.id);

  if (!guildConfig || !guildConfig[type]) {
    return interaction.reply({ embeds: [errorEmbed("Not Configured", `${type} system is not set up yet.`)], ephemeral: true });
  }

  let embed;
  if (type === "welcome") embed = buildWelcomeEmbed(guildConfig.welcome, interaction.member, interaction.guild);
  else if (type === "leave") embed = buildLeaveEmbed(guildConfig.leave, interaction.member, interaction.guild);
  else if (type === "boost") embed = buildBoostEmbed(guildConfig.boost, interaction.member, interaction.guild);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function showConfig(interaction, client) {
  const guildConfig = client.welcomeConfig?.get(interaction.guild.id);

  if (!guildConfig || Object.keys(guildConfig).length === 0) {
    return interaction.reply({ embeds: [infoEmbed("📋 Welcome Config", "No welcome/leave/boost systems configured yet.")], ephemeral: true });
  }

  const fields = [];
  if (guildConfig.welcome) {
    fields.push({
      name: "🎉 Welcome",
      value: `Channel: <#${guildConfig.welcome.channelId}>\nTitle: ${guildConfig.welcome.title}\nMessage: ${guildConfig.welcome.message}\nDM: ${guildConfig.welcome.dm ? "On" : "Off"}`,
      inline: false,
    });
  }
  if (guildConfig.leave) {
    fields.push({
      name: "👋 Leave",
      value: `Channel: <#${guildConfig.leave.channelId}>\nTitle: ${guildConfig.leave.title}\nMessage: ${guildConfig.leave.message}`,
      inline: false,
    });
  }
  if (guildConfig.boost) {
    fields.push({
      name: "⚡ Boost",
      value: `Channel: <#${guildConfig.boost.channelId}>\nTitle: ${guildConfig.boost.title}\nMessage: ${guildConfig.boost.message}`,
      inline: false,
    });
  }
  if (guildConfig.autorole) {
    fields.push({
      name: "🎭 Auto-Role",
      value: `Role: <@&${guildConfig.autorole}>`,
      inline: false,
    });
  }

  const embed = infoEmbed("📋 Welcome/Leave/Boost Config", "Current configuration:")
    .addFields(fields)
    .setFooter({ text: `${config.botName}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

function replacePlaceholders(str, member, guild, boostCount = 0) {
  const now = Date.now();
  const createdDays = Math.floor((now - member.user.createdTimestamp) / 86400000);
  const joinedDays = Math.floor((now - (member.joinedTimestamp || now)) / 86400000);
  const accountAge = `${createdDays} days`;
  const createdAt = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`;
  const joinedAt = `<t:${Math.floor((member.joinedTimestamp || now) / 1000)}:D>`;
  const roles = member.roles?.cache?.filter(r => r.id !== guild.id).map(r => `<@&${r.id}>`).join(", ") || "None";

  return str
    .replace(/{user}/g, member.toString())
    .replace(/{user.tag}/g, member.user.tag)
    .replace(/{user.name}/g, member.user.username)
    .replace(/{user.id}/g, member.user.id)
    .replace(/{user.avatar}/g, member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .replace(/{display_name}/g, member.displayName)
    .replace(/{global_name}/g, member.user.globalName || member.user.username)
    .replace(/{mention}/g, `<@${member.user.id}>`)
    .replace(/{created_at}/g, createdAt)
    .replace(/{joined_at}/g, joinedAt)
    .replace(/{account_age}/g, accountAge)
    .replace(/{roles}/g, roles)
    .replace(/{avatar_url}/g, member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
    .replace(/{server}/g, guild.name)
    .replace(/{server.id}/g, guild.id)
    .replace(/{server.icon}/g, guild.iconURL({ dynamic: true, size: 256 }) || "")
    .replace(/{membercount}/g, guild.memberCount.toString())
    .replace(/{boostcount}/g, boostCount.toString())
    .replace(/{boosttier}/g, guild.premiumTier.toString());
}

function buildWelcomeEmbed(cfg, member, guild) {
  const embed = new EmbedBuilder()
    .setTitle(replacePlaceholders(cfg.title, member, guild))
    .setDescription(replacePlaceholders(cfg.message, member, guild))
    .setColor(cfg.color)
    .setTimestamp();

  const thumb = replacePlaceholders(cfg.thumbnail, member, guild);
  if (thumb && thumb !== "{user.avatar}") embed.setThumbnail(thumb);
  else embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));

  if (cfg.image) {
    const img = replacePlaceholders(cfg.image, member, guild);
    if (img) embed.setImage(img);
  }

  embed.setFooter({ text: `${config.botName} | ${guild.name}` });
  return embed;
}

function buildLeaveEmbed(cfg, member, guild) {
  const embed = new EmbedBuilder()
    .setTitle(replacePlaceholders(cfg.title, member, guild))
    .setDescription(replacePlaceholders(cfg.message, member, guild))
    .setColor(cfg.color)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTimestamp()
    .setFooter({ text: `${config.botName} | ${guild.name}` });
  return embed;
}

function buildBoostEmbed(cfg, member, guild) {
  const embed = new EmbedBuilder()
    .setTitle(replacePlaceholders(cfg.title, member, guild))
    .setDescription(replacePlaceholders(cfg.message, member, guild, guild.premiumSubscriptionCount || 0))
    .setColor(cfg.color)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTimestamp()
    .setFooter({ text: `${config.botName} | ${guild.name}` });
  return embed;
}

// Event handlers
module.exports.handleMemberAdd = async (member, client) => {
  const guildConfig = client.welcomeConfig?.get(member.guild.id);
  if (!guildConfig?.welcome) return;

  const channel = member.guild.channels.cache.get(guildConfig.welcome.channelId);
  if (!channel) return;

  const embed = buildWelcomeEmbed(guildConfig.welcome, member, member.guild);
  await channel.send({ embeds: [embed] }).catch(() => {});

  if (guildConfig.welcome.dm) {
    const dmEmbed = new EmbedBuilder()
      .setTitle(`Welcome to ${member.guild.name}!`)
      .setDescription(replacePlaceholders(guildConfig.welcome.message, member, member.guild))
      .setColor(guildConfig.welcome.color)
      .setThumbnail(member.guild.iconURL({ dynamic: true, size: 256 }))
      .setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});
  }

  if (guildConfig.autorole) {
    const role = member.guild.roles.cache.get(guildConfig.autorole);
    if (role) await member.roles.add(role).catch(() => {});
  }
};

module.exports.handleMemberRemove = async (member, client) => {
  const guildConfig = client.welcomeConfig?.get(member.guild.id);
  if (!guildConfig?.leave) return;

  const channel = member.guild.channels.cache.get(guildConfig.leave.channelId);
  if (!channel) return;

  const embed = buildLeaveEmbed(guildConfig.leave, member, member.guild);
  await channel.send({ embeds: [embed] }).catch(() => {});
};

module.exports.handleGuildMemberUpdate = async (oldMember, newMember, client) => {
  const guildConfig = client.welcomeConfig?.get(newMember.guild.id);
  if (!guildConfig?.boost) return;

  const oldBoosting = oldMember.premiumSince;
  const newBoosting = newMember.premiumSince;

  if (!oldBoosting && newBoosting) {
    const channel = newMember.guild.channels.cache.get(guildConfig.boost.channelId);
    if (!channel) return;

    const embed = buildBoostEmbed(guildConfig.boost, newMember, newMember.guild);
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
};