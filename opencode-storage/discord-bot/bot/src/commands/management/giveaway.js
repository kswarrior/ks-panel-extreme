const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder } = require("discord.js");
const config = require("../../config");
const { successEmbed, errorEmbed, modEmbed } = require("../../utils/embed");

const DURATION_REGEX = /^(\d+)([smhd])$/;
const MULTIPLIERS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const MAX_DURATION = 2592000000;

function parseDuration(str) {
  const match = str.match(DURATION_REGEX);
  if (!match) return null;
  return parseInt(match[1]) * MULTIPLIERS[match[2]];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Start a new giveaway")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const modal = new ModalBuilder()
      .setCustomId("giveaway_modal")
      .setTitle("🎉 Create Giveaway");

    const prizeInput = new TextInputBuilder()
      .setCustomId("giveaway_prize")
      .setLabel("Prize")
      .setPlaceholder("Discord Nitro, 1000 KC, etc.")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(200)
      .setRequired(true);

    const winnersInput = new TextInputBuilder()
      .setCustomId("giveaway_winners")
      .setLabel("Number of Winners (1-20)")
      .setPlaceholder("1")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(2)
      .setRequired(true);

    const durationInput = new TextInputBuilder()
      .setCustomId("giveaway_duration")
      .setLabel("Duration (e.g. 10m, 1h, 1d, 30s)")
      .setPlaceholder("1h")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(6)
      .setRequired(true);

    const channelInput = new TextInputBuilder()
      .setCustomId("giveaway_channel")
      .setLabel("Channel ID (optional, leave empty for here)")
      .setPlaceholder(interaction.channel.id)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(20)
      .setRequired(false);

    const firstRow = new ActionRowBuilder().addComponents(prizeInput);
    const secondRow = new ActionRowBuilder().addComponents(winnersInput);
    const thirdRow = new ActionRowBuilder().addComponents(durationInput);
    const fourthRow = new ActionRowBuilder().addComponents(channelInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);
    await interaction.showModal(modal);
  },

  modalHandlers: {
    giveaway_modal: async (interaction, client) => {
      const prize = interaction.fields.getTextInputValue("giveaway_prize").trim();
      const winnersStr = interaction.fields.getTextInputValue("giveaway_winners").trim();
      const durationStr = interaction.fields.getTextInputValue("giveaway_duration").trim();
      const channelId = interaction.fields.getTextInputValue("giveaway_channel").trim();

      const winners = parseInt(winnersStr);
      if (isNaN(winners) || winners < 1 || winners > 20) {
        return interaction.reply({ content: "❌ Number of winners must be between 1 and 20.", ephemeral: true });
      }

      const ms = parseDuration(durationStr);
      if (!ms) return interaction.reply({ embeds: [errorEmbed("Invalid Duration", "Use format: `10m`, `1h`, `1d`, `30s`")], ephemeral: true });
      if (ms > MAX_DURATION) return interaction.reply({ embeds: [errorEmbed("Too Long", "Maximum duration is 30 days.")], ephemeral: true });
      if (ms < 10000) return interaction.reply({ embeds: [errorEmbed("Too Short", "Minimum duration is 10 seconds.")], ephemeral: true });

      let channel = interaction.channel;
      if (channelId) {
        const found = interaction.guild.channels.cache.get(channelId);
        if (!found || found.type !== 0) return interaction.reply({ content: "❌ Invalid text channel ID.", ephemeral: true });
        channel = found;
      }

      const endDate = new Date(Date.now() + ms);

      const embed = new EmbedBuilder()
        .setTitle("🎉 GIVEAWAY!")
        .setDescription(
          `**Prize:** ${prize}\n` +
          `**Winners:** ${winners}\n` +
          `**Hosted by:** ${interaction.user}\n` +
          `**Ends:** <t:${Math.floor(endDate.getTime() / 1000)}:R> (<t:${Math.floor(endDate.getTime() / 1000)}:F>)\n\n` +
          `Click the button below to enter!`
        )
        .setColor(0xf47fff)
        .setFooter({ text: `${config.botName} | Click button to enter` })
        .setTimestamp(endDate);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("giveaway_enter")
          .setLabel("🎉 Enter Giveaway (0 entries)")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ content: `✅ Giveaway started in ${channel}!`, ephemeral: true });
      const msg = await channel.send({ embeds: [embed], components: [row] });

      client.giveaways = client.giveaways || new Map();
      client.giveaways.set(msg.id, {
        messageId: msg.id,
        channelId: msg.channel.id,
        prize,
        winners,
        endTime: endDate.getTime(),
        participants: new Set(),
        hostId: interaction.user.id,
        ended: false,
      });

      const interval = setInterval(async () => {
        const g = client.giveaways.get(msg.id);
        if (!g || g.ended) {
          clearInterval(interval);
          return;
        }

        const remaining = g.endTime - Date.now();
        if (remaining <= 0) {
          clearInterval(interval);
          await endGiveawayByMessage(client, msg.id);
          return;
        }

        const liveEmbed = new EmbedBuilder()
          .setTitle("🎉 GIVEAWAY!")
          .setDescription(
            `**Prize:** ${g.prize}\n` +
            `**Winners:** ${g.winners}\n` +
            `**Entries:** ${g.participants.size}\n` +
            `**Hosted by:** <@${g.hostId}>\n` +
            `**Ends:** <t:${Math.floor(g.endTime / 1000)}:R> (<t:${Math.floor(g.endTime / 1000)}:F>)\n\n` +
            `Click the button below to enter!`
          )
          .setColor(0xf47fff)
          .setFooter({ text: `${config.botName} | ${g.participants.size} entries | Click to enter` })
          .setTimestamp(new Date(g.endTime));

        const liveRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("giveaway_enter")
            .setLabel(`🎉 Enter (${g.participants.size} entries)`)
            .setStyle(ButtonStyle.Primary)
        );

        await msg.edit({ embeds: [liveEmbed], components: [liveRow] }).catch(() => clearInterval(interval));
      }, 60000);

      setTimeout(async () => {
        clearInterval(interval);
        await endGiveawayByMessage(client, msg.id);
      }, ms);
    },
  },

  buttonHandlers: {
    giveaway_enter: async (interaction, client) => {
      const giveaway = client.giveaways?.get(interaction.message.id);
      if (!giveaway || giveaway.ended) return interaction.reply({ content: "❌ This giveaway has ended.", ephemeral: true });
      if (giveaway.participants.has(interaction.user.id)) return interaction.reply({ content: "❌ You are already entered in this giveaway!", ephemeral: true });

      giveaway.participants.add(interaction.user.id);

      const updatedEmbed = new EmbedBuilder()
        .setTitle("🎉 GIVEAWAY!")
        .setDescription(
          `**Prize:** ${giveaway.prize}\n**Winners:** ${giveaway.winners}\n**Entries:** ${giveaway.participants.size}\n` +
          `**Hosted by:** <@${giveaway.hostId}>\n**Ends:** <t:${Math.floor(giveaway.endTime / 1000)}:R> (<t:${Math.floor(giveaway.endTime / 1000)}:F>)\n\nClick the button below to enter!`
        )
        .setColor(0xf47fff)
        .setFooter({ text: `${config.botName} | ${giveaway.participants.size} entries | Click to enter` })
        .setTimestamp(new Date(giveaway.endTime));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("giveaway_enter")
          .setLabel(`🎉 Enter (${giveaway.participants.size} entries)`)
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.update({ embeds: [updatedEmbed], components: [row] }).catch(() => {});
      await interaction.followUp({ content: `✅ You entered the giveaway for **${giveaway.prize}**! (${giveaway.participants.size} total entries)`, ephemeral: true });
    },

    giveaway_reroll_: async (interaction, client) => {
      const messageId = interaction.customId.replace("giveaway_reroll_", "");
      const giveaway = client.giveaways?.get(messageId);
      if (!giveaway) return interaction.reply({ content: "❌ This giveaway data is no longer available.", ephemeral: true });
      if (!giveaway.ended) return interaction.reply({ content: "❌ This giveaway is still active.", ephemeral: true });
      if (interaction.user.id !== giveaway.hostId && !interaction.member.permissions.has("ManageGuild")) {
        return interaction.reply({ content: "❌ Only the giveaway host or a moderator can reroll.", ephemeral: true });
      }

      const reParticipants = [...giveaway.participants];
      if (reParticipants.length === 0) return interaction.reply({ content: "No participants to reroll.", ephemeral: true });

      const newWinner = reParticipants[Math.floor(Math.random() * reParticipants.length)];
      await interaction.reply({ content: `🔄 Rerolled! New winner: <@${newWinner}> for **${giveaway.prize}**!` });
      await interaction.channel.send(`🎉 Congratulations <@${newWinner}>! You won the rerolled giveaway for **${giveaway.prize}**!`).catch(() => {});
    },
  },
};

async function endGiveawayByMessage(client, messageId) {
  const giveaway = client.giveaways?.get(messageId);
  if (!giveaway || giveaway.ended) return;

  giveaway.ended = true;

  const channel = client.channels.cache.get(giveaway.channelId);
  if (!channel) return client.giveaways.delete(messageId);

  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return client.giveaways.delete(messageId);

  if (giveaway.participants.size === 0) {
    const endEmbed = new EmbedBuilder()
      .setTitle("🎉 GIVEAWAY ENDED!")
      .setDescription(`**Prize:** ${giveaway.prize}\n**Winner:** No participants!\n**Hosted by:** <@${giveaway.hostId}>`)
      .setColor(0xed4245)
      .setTimestamp();

    await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
    await channel.send(`⚠️ The giveaway for **${giveaway.prize}** ended with no participants.`).catch(() => {});
    client.giveaways.delete(messageId);
    return;
  }

  const allParticipants = [...giveaway.participants];
  const selected = [];
  for (let i = 0; i < giveaway.winners && allParticipants.length > 0; i++) {
    const idx = Math.floor(Math.random() * allParticipants.length);
    selected.push(allParticipants.splice(idx, 1)[0]);
  }

  const winnerMentions = selected.map((id) => `<@${id}>`).join(", ");
  const endEmbed = new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY ENDED!")
    .setDescription(
      `**Prize:** ${giveaway.prize}\n**Winner(s):** ${winnerMentions}\n**Total Entries:** ${giveaway.participants.size}\n**Hosted by:** <@${giveaway.hostId}>`
    )
    .setColor(0x57f287)
    .setTimestamp();

  const rerollRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_reroll_${messageId}`)
      .setLabel("🔄 Reroll")
      .setStyle(ButtonStyle.Secondary)
  );

  await msg.edit({ embeds: [endEmbed], components: [rerollRow] }).catch(() => {});
  await channel.send(`🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`).catch(() => {});
}