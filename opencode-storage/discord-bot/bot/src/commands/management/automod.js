const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { successEmbed, errorEmbed, modEmbed, buildCard } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure auto-moderation")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Enable/disable auto-mod features")
        .addStringOption((o) =>
          o.setName("feature").setDescription("Feature to toggle").setRequired(true)
            .addChoices(
              { name: "Anti-Spam", value: "antispam" },
              { name: "Anti-Link", value: "antilink" },
              { name: "Anti-Invite", value: "antiinvite" },
              { name: "Anti-Mention Spam", value: "antimassmention" },
              { name: "Anti-Caps", value: "anticaps" },
              { name: "Bad Words Filter", value: "badwords" },
              { name: "Anti-Emoji Spam", value: "antiemojispam" },
              { name: "Anti-Ghost Ping", value: "antighostping" },
            )
        )
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configure auto-mod settings")
        .addStringOption((o) =>
          o.setName("feature").setDescription("Feature to configure").setRequired(true)
            .addChoices(
              { name: "Anti-Spam", value: "antispam" },
              { name: "Anti-Caps", value: "anticaps" },
              { name: "Bad Words", value: "badwords" },
            )
        )
        .addIntegerOption((o) => o.setName("threshold").setDescription("Threshold (messages for spam, % for caps)").setRequired(false))
        .addIntegerOption((o) => o.setName("timeframe").setDescription("Timeframe in seconds (for spam)").setRequired(false))
        .addStringOption((o) => o.setName("action").setDescription("Action to take").setRequired(false)
            .addChoices(
              { name: "Delete", value: "delete" },
              { name: "Warn", value: "warn" },
              { name: "Timeout", value: "timeout" },
              { name: "Kick", value: "kick" },
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("badwords")
        .setDescription("Manage bad words list")
        .addStringOption((o) =>
          o.setName("action").setDescription("Action").setRequired(true)
            .addChoices(
              { name: "Add", value: "add" },
              { name: "Remove", value: "remove" },
              { name: "List", value: "list" },
            )
        )
        .addStringOption((o) => o.setName("word").setDescription("Word to add/remove").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("whitelist")
        .setDescription("Manage whitelisted channels/roles for auto-mod")
        .addStringOption((o) =>
          o.setName("type").setDescription("Type to whitelist").setRequired(true)
            .addChoices(
              { name: "Channel", value: "channel" },
              { name: "Role", value: "role" },
            )
        )
        .addStringOption((o) =>
          o.setName("action").setDescription("Action").setRequired(true)
            .addChoices(
              { name: "Add", value: "add" },
              { name: "Remove", value: "remove" },
            )
        )
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to whitelist").setRequired(false))
        .addRoleOption((o) => o.setName("role").setDescription("Role to whitelist").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("logchannel")
        .setDescription("Set auto-mod log channel")
        .addChannelOption((o) => o.setName("channel").setDescription("Log channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show current auto-mod configuration")
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === "toggle") await toggleAutomod(interaction, client);
    else if (sub === "config") await configAutomod(interaction, client);
    else if (sub === "badwords") await manageBadWords(interaction, client);
    else if (sub === "whitelist") await manageWhitelist(interaction, client);
    else if (sub === "logchannel") await setLogChannel(interaction, client);
    else if (sub === "show") await showConfig(interaction, client);
  },
};

async function toggleAutomod(interaction, client) {
  const feature = interaction.options.getString("feature");
  const enabled = interaction.options.getBoolean("enabled");

  client.automodConfig = client.automodConfig || new Map();
  const guildConfig = client.automodConfig.get(interaction.guild.id) || getDefaultConfig();
  guildConfig[feature] = enabled;
  client.automodConfig.set(interaction.guild.id, guildConfig);

  await interaction.reply({ embeds: [successEmbed("✅ Auto-Mod Updated", `${feature} is now **${enabled ? "enabled" : "disabled"}**.`)], ephemeral: true });
}

async function configAutomod(interaction, client) {
  const feature = interaction.options.getString("feature");
  const threshold = interaction.options.getInteger("threshold");
  const timeframe = interaction.options.getInteger("timeframe");
  const action = interaction.options.getString("action");

  client.automodConfig = client.automodConfig || new Map();
  const guildConfig = client.automodConfig.get(interaction.guild.id) || getDefaultConfig();

  if (threshold !== null) guildConfig[`${feature}_threshold`] = threshold;
  if (timeframe !== null) guildConfig[`${feature}_timeframe`] = timeframe;
  if (action) guildConfig[`${feature}_action`] = action;

  client.automodConfig.set(interaction.guild.id, guildConfig);

  await interaction.reply({ embeds: [successEmbed("✅ Settings Updated", `${feature} configuration updated.`)], ephemeral: true });
}

async function manageBadWords(interaction, client) {
  const action = interaction.options.getString("action");
  const word = interaction.options.getString("word");

  client.automodConfig = client.automodConfig || new Map();
  const guildConfig = client.automodConfig.get(interaction.guild.id) || getDefaultConfig();

  if (!guildConfig.badwords_list) guildConfig.badwords_list = [];

  if (action === "add") {
    if (!word) return interaction.reply({ embeds: [errorEmbed("Missing Word", "Please provide a word to add.")], ephemeral: true });
    if (guildConfig.badwords_list.includes(word.toLowerCase())) {
      return interaction.reply({ embeds: [errorEmbed("Exists", "That word is already in the list.")], ephemeral: true });
    }
    guildConfig.badwords_list.push(word.toLowerCase());
    await interaction.reply({ embeds: [successEmbed("✅ Added", `Added "${word}" to bad words list.`)], ephemeral: true });
  } else if (action === "remove") {
    if (!word) return interaction.reply({ embeds: [errorEmbed("Missing Word", "Please provide a word to remove.")], ephemeral: true });
    const idx = guildConfig.badwords_list.indexOf(word.toLowerCase());
    if (idx === -1) return interaction.reply({ embeds: [errorEmbed("Not Found", "That word is not in the list.")], ephemeral: true });
    guildConfig.badwords_list.splice(idx, 1);
    await interaction.reply({ embeds: [successEmbed("✅ Removed", `Removed "${word}" from bad words list.`)], ephemeral: true });
  } else if (action === "list") {
    const words = guildConfig.badwords_list.length ? guildConfig.badwords_list.join(", ") : "None";
    await interaction.reply({ embeds: [modEmbed("📝 Bad Words List", words)], ephemeral: true });
  }

  client.automodConfig.set(interaction.guild.id, guildConfig);
}

async function manageWhitelist(interaction, client) {
  const type = interaction.options.getString("type");
  const action = interaction.options.getString("action");
  const channel = interaction.options.getChannel("channel");
  const role = interaction.options.getRole("role");

  client.automodConfig = client.automodConfig || new Map();
  const guildConfig = client.automodConfig.get(interaction.guild.id) || getDefaultConfig();

  if (!guildConfig.whitelist_channels) guildConfig.whitelist_channels = [];
  if (!guildConfig.whitelist_roles) guildConfig.whitelist_roles = [];

  const target = type === "channel" ? (channel?.id || "") : (role?.id || "");
  if (!target) return interaction.reply({ embeds: [errorEmbed("Missing Target", `Please provide a ${type}.`)], ephemeral: true });

  const list = type === "channel" ? guildConfig.whitelist_channels : guildConfig.whitelist_roles;

  if (action === "add") {
    if (list.includes(target)) return interaction.reply({ embeds: [errorEmbed("Exists", "Already whitelisted.")], ephemeral: true });
    list.push(target);
    await interaction.reply({ embeds: [successEmbed("✅ Whitelisted", `${type} added to whitelist.`)], ephemeral: true });
  } else if (action === "remove") {
    const idx = list.indexOf(target);
    if (idx === -1) return interaction.reply({ embeds: [errorEmbed("Not Found", "Not in whitelist.")], ephemeral: true });
    list.splice(idx, 1);
    await interaction.reply({ embeds: [successEmbed("✅ Removed", `${type} removed from whitelist.`)], ephemeral: true });
  }

  client.automodConfig.set(interaction.guild.id, guildConfig);
}

async function setLogChannel(interaction, client) {
  const channel = interaction.options.getChannel("channel");

  client.automodConfig = client.automodConfig || new Map();
  const guildConfig = client.automodConfig.get(interaction.guild.id) || getDefaultConfig();
  guildConfig.log_channel = channel.id;
  client.automodConfig.set(interaction.guild.id, guildConfig);

  await interaction.reply({ embeds: [successEmbed("✅ Log Channel Set", `Auto-mod logs will be sent to ${channel}`)], ephemeral: true });
}

async function showConfig(interaction, client) {
  const guildConfig = client.automodConfig?.get(interaction.guild.id) || getDefaultConfig();

  const features = [
    "antispam", "antilink", "antiinvite", "antimassmention",
    "anticaps", "badwords", "antiemojispam", "antighostping"
  ];

  const fields = features.map(f => ({
    name: f.replace(/anti/g, "Anti ").replace(/spam/, "Spam").replace(/link/, "Link").replace(/invite/, "Invite").replace(/massmention/, "Mention Spam").replace(/caps/, "Caps").replace(/badwords/, "Bad Words").replace(/emojispam/, "Emoji Spam").replace(/ghostping/, "Ghost Ping"),
    value: guildConfig[f] ? "✅ Enabled" : "❌ Disabled",
    inline: true,
  }));

    if (guildConfig.log_channel) {
      fields.push({ name: "📋 Log Channel", value: `<#${guildConfig.log_channel}>`, inline: true });
    }
    fields.push({ name: "📝 Bad Words", value: `${guildConfig.badwords_list?.length || 0} words`, inline: true });
    fields.push({ name: "📢 Whitelisted Channels", value: `${guildConfig.whitelist_channels?.length || 0}`, inline: true });
    fields.push({ name: "🎭 Whitelisted Roles", value: `${guildConfig.whitelist_roles?.length || 0}`, inline: true });
    
    const card = buildCard({
      title: "🛡️ Auto-Mod Config",
      description: "Current configuration:",
      theme: "mod",
      fields: fields,
      grid: true,
      perRow: 2
    });

    await interaction.reply({ embeds: [card], ephemeral: true });
  }


function getDefaultConfig() {
  return {
    antispam: false,
    antilink: false,
    antiinvite: false,
    antimassmention: false,
    anticaps: false,
    badwords: false,
    antiemojispam: false,
    antighostping: false,
    antispam_threshold: 5,
    antispam_timeframe: 5,
    antimassmention_threshold: 5,
    anticaps_threshold: 70,
    antispam_action: "delete",
    antilink_action: "delete",
    antiinvite_action: "delete",
    badwords_action: "delete",
    log_channel: null,
    whitelist_channels: [],
    whitelist_roles: [],
    badwords_list: [],
  };
}

// Message filter - call this from messageCreate event
module.exports.filterMessage = async (message, client) => {
  if (!message.guild || message.author.bot) return;
  if (message.member?.permissions.has("Administrator")) return;

  const guildConfig = client.automodConfig?.get(message.guild.id);
  if (!guildConfig) return;

  // Check whitelist
  if (guildConfig.whitelist_channels?.includes(message.channel.id)) return;
  if (message.member.roles.cache.some(r => guildConfig.whitelist_roles?.includes(r.id))) return;

  const content = message.content;
  let triggered = false;
  let reason = "";
  let action = "delete";

  // Anti-Link
  if (guildConfig.antilink && /https?:\/\/[^\s]+/.test(content)) {
    triggered = true;
    reason = "Links are not allowed";
    action = guildConfig.antilink_action || "delete";
  }

  // Anti-Invite
  if (guildConfig.antiinvite && /(discord\.gg|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i.test(content)) {
    triggered = true;
    reason = "Discord invites are not allowed";
    action = guildConfig.antiinvite_action || "delete";
  }

  // Bad Words
  if (guildConfig.badwords && guildConfig.badwords_list?.length) {
    const found = guildConfig.badwords_list.find(w => content.toLowerCase().includes(w));
    if (found) {
      triggered = true;
      reason = `Contains filtered word: ${found}`;
      action = guildConfig.badwords_action || "delete";
    }
  }

  // Anti-Caps
  if (guildConfig.anticaps && content.length > 10) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length > 0) {
      const caps = letters.replace(/[^A-Z]/g, "").length;
      const percent = (caps / letters.length) * 100;
      if (percent >= (guildConfig.anticaps_threshold || 70)) {
        triggered = true;
        reason = `Too many caps (${Math.round(percent)}%)`;
        action = "delete";
      }
    }
  }

  // Anti-Emoji Spam
  if (guildConfig.antiemojispam) {
    const emojiCount = (content.match(/<a?:[a-zA-Z0-9_]+:\d+>/g) || []).length;
    if (emojiCount > 10) {
      triggered = true;
      reason = "Too many custom emojis";
      action = "delete";
    }
  }

  if (triggered) {
    try {
      await message.delete().catch(() => {});
      await sendLog(message.guild, guildConfig, `🛡️ Auto-Mod: ${action}`, `${message.author} (${message.author.tag})\nChannel: ${message.channel}\nReason: ${reason}\nContent: ${content.substring(0, 1000)}`);
    } catch (e) {}
    return true;
  }

  return false;
};

// Anti-spam tracking
const userMessages = new Map();

module.exports.trackSpam = async (message, client) => {
  if (!message.guild || message.author.bot) return false;

  const guildConfig = client.automodConfig?.get(message.guild.id);
  if (!guildConfig?.antispam) return false;

  if (guildConfig.whitelist_channels?.includes(message.channel.id)) return false;
  if (message.member?.permissions.has("Administrator")) return false;
  if (message.member.roles.cache.some(r => guildConfig.whitelist_roles?.includes(r.id))) return false;

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const timeframe = (guildConfig.antispam_timeframe || 5) * 1000;
  const threshold = guildConfig.antispam_threshold || 5;

  const userMsg = userMessages.get(key) || { count: 0, first: now, last: now };
  userMsg.count++;
  userMsg.last = now;
  userMessages.set(key, userMsg);

  // Clean old entries periodically
  if (userMessages.size > 10000) {
    for (const [k, v] of userMessages.entries()) {
      if (now - v.last > 60000) userMessages.delete(k);
    }
  }

  if (userMsg.count >= threshold && now - userMsg.first < timeframe) {
    userMessages.delete(key);
    try {
      await message.delete().catch(() => {});
      const action = guildConfig.antispam_action || "delete";
      await sendLog(message.guild, guildConfig, `🛡️ Anti-Spam: ${action}`, `${message.author} sent ${threshold} messages in ${timeframe/1000}s`);
    } catch (e) {}
    return true;
  }

  return false;
};

// Anti-mass mention
module.exports.checkMassMention = async (message, client) => {
  if (!message.guild || message.author.bot) return false;

  const guildConfig = client.automodConfig?.get(message.guild.id);
  if (!guildConfig?.antimassmention) return false;

  const mentions = message.mentions.users.size + message.mentions.roles.size;
  if (mentions >= (guildConfig.antimassmention_threshold || 5)) {
    try {
      await message.delete().catch(() => {});
      await sendLog(message.guild, guildConfig, "🛡️ Anti-Mass Mention", `${message.author} mentioned ${mentions} users/roles`);
    } catch (e) {}
    return true;
  }
  return false;
};

// Anti-ghost ping
module.exports.checkGhostPing = async (message, client) => {
  if (!message.guild || message.author.bot) return false;

  const guildConfig = client.automodConfig?.get(message.guild.id);
  if (!guildConfig?.antighostping) return false;

  if (message.mentions.users.size > 0 || message.mentions.roles.size > 0) {
    // Check if message was deleted quickly (ghost ping)
    setTimeout(async () => {
      const fetched = await message.channel.messages.fetch(message.id).catch(() => null);
      if (!fetched && message.deletable) {
        await sendLog(message.guild, guildConfig, "👻 Ghost Ping Detected", `${message.author} mentioned ${message.mentions.users.size} users/roles then deleted message`);
      }
    }, 3000);
  }
  return false;
};

async function sendLog(guild, config, title, description) {
  if (!config.log_channel) return;
  const channel = guild.channels.cache.get(config.log_channel);
  if (!channel) return;
  
  const { modEmbed } = require("../../utils/embed");
  const embed = modEmbed(title, description);
  
  await channel.send({ embeds: [embed] }).catch(() => {});
}