const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("../../config");

const CATEGORY_EMOJIS = {
  moderation: "🛡️",
  management: "⚙️",
  economy: "💰",
  tickets: "🎫",
  verification: "✅",
  utility: "🔧",
  fun: "🎮",
  config: "📋",
};

const CATEGORY_DESCRIPTIONS = {
  moderation: "Keep your server safe with powerful moderation tools",
  management: "Manage your server with polls, giveaways, announcements, and more",
  economy: "Earn, spend, and gamble KS Hub Credits (KC) with an engaging economy system",
  tickets: "Support ticket system for handling user requests",
  verification: "Verify new members with CAPTCHA protection",
  utility: "Useful tools like server info, user info, weather, math, and more",
  fun: "Fun games and interactive commands to keep members entertained",
  config: "Configure bot settings like welcome messages, auto-role, and more",
};

const CATEGORY_COLORS = {
  moderation: 0xed4245,
  management: 0xfee75c,
  economy: 0x57f287,
  tickets: 0xf47fff,
  verification: 0x5865f2,
  utility: 0x5865f2,
  fun: 0xffa500,
  config: 0x808080,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all bot commands and information")
    .addStringOption((o) =>
      o
        .setName("command")
        .setDescription("Get detailed help for a specific command")
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const commandName = interaction.options.getString("command");

    if (commandName) {
      const cmd = client.commands.get(commandName);
      if (!cmd) return interaction.reply({ content: `❌ Command \`/${commandName}\` not found.`, ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`📖 Command: /${commandName}`)
        .setDescription(cmd.data.description)
        .addFields(
          { name: "Category", value: getCommandCategory(commandName, client) || "Unknown", inline: true }
        )
        .setColor(config.colors.primary)
        .setFooter({ text: `${config.botName} | Use /help command:<name> for more details` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏠 ${config.botName} - Help Menu`)
      .setDescription(
        `Welcome to **${config.botName}**! Here's everything you need to know.\n\n` +
        `**⚡ Quick Links**\n` +
        `• Economy: Earn KC through chatting, daily rewards, work, gambling & more\n` +
        `• Leveling: Gain XP by chatting — every 100 messages = **1,000 KC** bonus!\n` +
        `• Games: Coinflip, Dice, Slots, Blackjack, Number Guess, RPS, and more\n` +
        `• Moderation: Full suite of mod commands to keep your server safe\n\n` +
        `**📌 Select a category below** or use \`/help command:<name>\` for details.`
      )
      .setColor(config.colors.primary)
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `${config.botName} by KS Warrior (@ks_warrior_pro) | KS Hub` })
      .setTimestamp();

    const fields = [];
    for (const [category, cmds] of client.categories) {
      if (!CATEGORY_EMOJIS[category]) continue;
      const cmdList = cmds.map((n) => `\`/${n}\``).join(" ");
      fields.push({
        name: `${CATEGORY_EMOJIS[category]} ${category.charAt(0).toUpperCase() + category.slice(1)} (${cmds.length} commands)`,
        value: `${cmdList}\n*${CATEGORY_DESCRIPTIONS[category] || ""}*`,
        inline: false,
      });
    }
    embed.addFields(fields);

    // Leveling & Message Earning Info
    embed.addFields({
      name: "📈 Leveling & Message Rewards",
      value:
        "• **XP System:** 5-25 XP per message (60s cooldown)\n" +
        "• **XP Formula:** `100 × level^1.5` required per level\n" +
        "• **Level Up:** Announced in `#level-up` channel\n" +
        "• **Check Rank:** `/rank [@user]`\n" +
        "• **Message Earning:** Every **100 messages** you earn **1,000 KC** 💰\n" +
        "• **Track:** `/messagecount` to see your message count",
      inline: false,
    });

    // Welcome System Variables
    embed.addFields({
      name: "🎉 Welcome System Variables",
      value:
        "Available placeholders for `/welcomesystem`:\n" +
        "`{user}` `{user.tag}` `{user.name}` `{user.id}` `{user.avatar}`\n" +
        "`{display_name}` `{global_name}` `{mention}`\n" +
        "`{created_at}` `{joined_at}` `{account_age}` `{roles}`\n" +
        "`{server}` `{server.id}` `{server.icon}` `{membercount}`\n" +
        "`{boostcount}` `{boosttier}` `{avatar_url}`",
      inline: false,
    });

    // Games Section
    embed.addFields({
      name: "🎮 Games & Gambling",
      value:
        "• **`/coinflip <amount> <target:heads/tails>`** — Bet KC, double or nothing\n" +
        "• **`/dice <amount> <guess:1-6>`** — Bet KC, 6x if correct\n" +
        "• **`/slots <amount>`** — Spin slots for KC multiplier\n" +
        "• **`/blackjack <amount>`** — Play Blackjack vs the bot\n" +
        "• **`/numberguess <amount>`** — Guess 1-10, 10x reward\n" +
        "• **`/gamble <amount> <high/low>`** — Dice high/low (1-12)\n" +
        "• **`/rps <choice>`** — Rock Paper Scissors\n" +
        "• **`/roll [sides]`** — Roll a dice\n" +
        "• **`/8ball <question>`** — Magic 8-Ball\n" +
        "• **`/trivia [category]`** — Random trivia\n" +
        "• **`/truthordare`** **`/wouldyourather`** **`/joke`** **`/meme`** **`/fact`** **`/quote`**",
      inline: false,
    });

    // Economy Summary
    embed.addFields({
      name: "💰 Economy Overview",
      value:
        "• **`/balance [@user]`** — Check KC balance\n" +
        "• **`/daily`** — 100 KC daily reward\n" +
        "• **`/work`** — Work a job (50-400 KC, 1h cooldown)\n" +
        "• **`/beg`** — Beg for 5-50 KC (30m cooldown)\n" +
        "• **`/rob @user`** — Rob someone (50% chance, 2h cooldown)\n" +
        "• **`/shop`** **`/buy <item>`** **`/inventory`** — Shop system\n" +
        "• **`/leaderboard`** — Top 10 richest\n" +
        "• **`/give @user <amount>`** — Send KC to others",
      inline: false,
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help_category_select")
        .setPlaceholder("🔍 Select a category for detailed commands")
        .addOptions(
          Object.entries(CATEGORY_EMOJIS).map(([value, emoji]) => ({
            label: `${emoji} ${value.charAt(0).toUpperCase() + value.slice(1)}`,
            value,
            description: CATEGORY_DESCRIPTIONS[value]?.substring(0, 50) || "",
          }))
        )
    );

    const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
  },

  selectMenuHandlers: {
    help_category_select: async (interaction, client) => {
      const category = interaction.values[0];
      const cmds = client.categories.get(category);
      if (!cmds) return interaction.reply({ content: "Category not found.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`${CATEGORY_EMOJIS[category] || ""} ${category.charAt(0).toUpperCase() + category.slice(1)} Commands`)
        .setDescription(CATEGORY_DESCRIPTIONS[category] || `Commands for the ${category} category.`)
        .setColor(CATEGORY_COLORS[category] || config.colors.primary)
        .setFooter({ text: `${config.botName} | ${cmds.length} commands` })
        .setTimestamp();

      for (const name of cmds) {
        const cmd = client.commands.get(name);
        if (cmd) {
          embed.addFields({
            name: `/${name}`,
            value: cmd.data.description || "No description available.",
            inline: true,
          });
        }
      }

      const row = new ActionRowBuilder().addComponents(
  new StringSelectMenuBuilder()
    .setCustomId("help_category_select")
    .setPlaceholder("🔍 Select a category for detailed commands")
    .addOptions(
      Object.entries(CATEGORY_EMOJIS).map(([value, emoji]) => ({
        label: `${emoji} ${value.charAt(0).toUpperCase() + value.slice(1)}`,
        value,
        description: CATEGORY_DESCRIPTIONS[value]?.substring(0, 50) || "",
      }))
    )
);
await interaction.update({ embeds: [embed], components: [row] });
    },
  },
};

function getCommandCategory(commandName, client) {
  for (const [category, cmds] of client.categories) {
    if (cmds.includes(commandName)) return category.charAt(0).toUpperCase() + category.slice(1);
  }
  return null;
}