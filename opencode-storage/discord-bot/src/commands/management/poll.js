const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const config = require("../../config");

const EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll with button voting"),

  async execute(interaction, client) {
    const modal = new ModalBuilder()
      .setCustomId("poll_modal")
      .setTitle("📊 Create a Poll");

    const questionInput = new TextInputBuilder()
      .setCustomId("poll_question")
      .setLabel("Poll Question")
      .setPlaceholder("What is your question?")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(250)
      .setRequired(true);

    const optionsInput = new TextInputBuilder()
      .setCustomId("poll_options")
      .setLabel("Options (one per line, 2-10 options)")
      .setPlaceholder("Option 1\nOption 2\nOption 3\nOption 4\n...")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(true);

    const durationInput = new TextInputBuilder()
      .setCustomId("poll_duration")
      .setLabel("Duration in minutes (0 or empty = no limit)")
      .setPlaceholder("60")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(5)
      .setRequired(false);

    const firstRow = new ActionRowBuilder().addComponents(questionInput);
    const secondRow = new ActionRowBuilder().addComponents(optionsInput);
    const thirdRow = new ActionRowBuilder().addComponents(durationInput);

    modal.addComponents(firstRow, secondRow, thirdRow);
    await interaction.showModal(modal);
  },

  modalHandlers: {
    poll_modal: async (interaction, client) => {
      const question = interaction.fields.getTextInputValue("poll_question").trim();
      const rawOptions = interaction.fields.getTextInputValue("poll_options").trim();
      const durationStr = interaction.fields.getTextInputValue("poll_duration").trim();

      const options = rawOptions
        .split("\n")
        .map((o) => o.trim())
        .filter((o) => o.length > 0);

      if (options.length < 2) {
        return interaction.reply({ content: "❌ You need at least 2 options for a poll!", ephemeral: true });
      }

      if (options.length > 10) {
        return interaction.reply({ content: "❌ Maximum 10 options allowed!", ephemeral: true });
      }

      const duration = parseInt(durationStr) || 0;
      const endTime = duration > 0 ? Date.now() + duration * 60000 : null;

      const pollData = {
        question,
        options,
        votes: new Array(options.length).fill(0),
        voters: new Array(options.length).fill(null).map(() => new Set()),
        creator: interaction.user.id,
        endTime,
      };

      if (!client.polls) client.polls = new Map();

      const embed = createPollEmbed(pollData, interaction.user, endTime);

      const buttons = options.map((opt, i) =>
        new ButtonBuilder()
          .setCustomId(`poll_vote_${i}`)
          .setLabel(`${EMOJIS[i]} ${opt.substring(0, 40)}${opt.length > 40 ? "..." : ""}`)
          .setStyle(ButtonStyle.Secondary)
      );

      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      const endButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("poll_end")
          .setLabel("🏁 End Poll")
          .setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({ embeds: [embed], components: [...rows, endButton], fetchReply: true });

      pollData.messageId = msg.id;
      pollData.channelId = msg.channel.id;
      client.polls.set(msg.id, pollData);

      if (endTime) {
        setTimeout(async () => {
          await endPoll(client, msg.id);
        }, duration * 60000);
      }
    },
  },

  buttonHandlers: {
    poll_vote_: async (interaction, client) => {
      const optionIndex = parseInt(interaction.customId.replace("poll_vote_", ""));
      const poll = client.polls?.get(interaction.message.id);
      if (!poll) return interaction.reply({ content: "❌ This poll has ended or doesn't exist.", ephemeral: true });
      if (poll.endTime && Date.now() >= poll.endTime) return interaction.reply({ content: "❌ This poll has ended.", ephemeral: true });

      const userId = interaction.user.id;
      for (let i = 0; i < poll.votes.length; i++) poll.voters[i].delete(userId);
      poll.voters[optionIndex].add(userId);
      poll.votes = poll.voters.map((voters) => voters.size);

      const creator = client.users.resolve(poll.creator);
      const embed = createPollEmbed(poll, creator, poll.endTime);

      const buttons = poll.options.map((opt, i) =>
        new ButtonBuilder()
          .setCustomId(`poll_vote_${i}`)
          .setLabel(`${EMOJIS[i]} ${opt.substring(0, 40)}${opt.length > 40 ? "..." : ""} (${poll.votes[i]})`)
          .setStyle(i === optionIndex ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );

      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      const endButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("poll_end")
          .setLabel("🏁 End Poll")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ embeds: [embed], components: [...rows, endButton] });
      await interaction.followUp({ content: `✅ You voted for **${poll.options[optionIndex]}**!`, ephemeral: true });
    },

    poll_end: async (interaction, client) => {
      const poll = client.polls?.get(interaction.message.id);
      if (!poll) return interaction.reply({ content: "❌ This poll has already ended.", ephemeral: true });
      if (interaction.user.id !== poll.creator && !interaction.member.permissions.has("ManageMessages")) {
        return interaction.reply({ content: "❌ Only the poll creator or a moderator can end this poll.", ephemeral: true });
      }
      await endPoll(client, interaction.message.id, interaction);
    },
  },
};

function createPollEmbed(pollData, creator, endTime) {
  const totalVotes = pollData.votes.reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(...pollData.votes, 1);

  const description = pollData.options
    .map((opt, i) => {
      const votes = pollData.votes[i];
      const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
      const barLength = Math.round((votes / maxVotes) * 10);
      const bar = "🟦".repeat(barLength) + "⬜".repeat(10 - barLength);
      return `${EMOJIS[i]} **${opt}**\n${bar} ${votes} votes (${percentage}%)`;
    })
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${pollData.question}`)
    .setDescription(description)
    .addFields({ name: "Total Votes", value: totalVotes.toString(), inline: true })
    .setColor(config.colors.primary)
    .setFooter({ text: `Poll by ${creator?.tag || "Unknown"} | ${config.botName}` })
    .setTimestamp();

  if (endTime) {
    embed.addFields({ name: "Ends", value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true });
  }

  return embed;
}

async function endPoll(client, messageId, interaction = null) {
  const pollData = client.polls?.get(messageId);
  if (!pollData) return;

  client.polls.delete(messageId);

  const totalVotes = pollData.votes.reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(...pollData.votes, 0);
  const winners = [];

  for (let i = 0; i < pollData.votes.length; i++) {
    if (pollData.votes[i] === maxVotes && maxVotes > 0) {
      winners.push(pollData.options[i]);
    }
  }

  const description = pollData.options
    .map((opt, i) => {
      const votes = pollData.votes[i];
      const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
      return `${EMOJIS[i]} **${opt}** - ${votes} votes (${percentage}%)`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle(`🏁 Poll Ended: ${pollData.question}`)
    .setDescription(description)
    .addFields(
      { name: "Total Votes", value: totalVotes.toString(), inline: true },
      { name: "Winner(s)", value: winners.length > 0 ? winners.join(", ") : "No votes", inline: false }
    )
    .setColor(winners.length > 0 ? config.colors.success : config.colors.info)
    .setFooter({ text: `${config.botName} | Poll Results` })
    .setTimestamp();

  if (interaction && !interaction.replied) {
    await interaction.reply({ embeds: [embed] });
  }

  const channel = client.channels.cache.get(pollData.channelId);
  if (channel) {
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }
  }
}