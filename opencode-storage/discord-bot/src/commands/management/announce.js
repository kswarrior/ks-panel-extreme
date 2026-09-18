const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const config = require("../../config");
const { modEmbed, errorEmbed } = require("../../utils/embed");
const security = require("../../utils/security");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send a server announcement via a form")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    // Security: only privileged members (Manage Guild / Admin / owner) may use this
    if (!security.isPrivileged(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed("Not Allowed", "You need the **Manage Server** permission to use this command.")],
        ephemeral: true,
      });
    }

    // Per-guild modal id so the handler knows which guild to target
    const modalId = `announce_modal:${interaction.guild.id}`;

    const modal = new ModalBuilder().setCustomId(modalId).setTitle("📢 Send an Announcement");
 
    const channelInput = new TextInputBuilder()
      .setCustomId("announce_channel")
      .setLabel("Channel ID or mention (e.g. #announcements)")
      .setPlaceholder(`${interaction.channel.id}`)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(security.LIMITS.CHANNEL_ID)
      .setRequired(false);
 
    const titleInput = new TextInputBuilder()
      .setCustomId("announce_title")
      .setLabel("Title")
      .setPlaceholder("Big news!")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(security.LIMITS.TITLE)
      .setRequired(true);
 
    const messageInput = new TextInputBuilder()
      .setCustomId("announce_message")
      .setLabel("Message")
      .setPlaceholder("Write your announcement here...")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(security.LIMITS.MESSAGE)
      .setRequired(true);
 
    const colorInput = new TextInputBuilder()
      .setCustomId("announce_color")
      .setLabel("Color (hex, e.g. #FF0000) — optional")
      .setPlaceholder("#5865F2")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(7)
      .setRequired(false);
 
    const imageInput = new TextInputBuilder()
      .setCustomId("announce_image")
      .setLabel("Image URL — optional")
      .setPlaceholder("https://example.com/image.png")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
 
    const footerInput = new TextInputBuilder()
      .setCustomId("announce_footer")
      .setLabel("Footer Text — optional")
      .setPlaceholder("Official Server Announcement")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
  
    // NOTE: This input is defined but NOT added to the modal because Discord limits modals to 5 components.
    // To include it, we would need to merge other fields or use a different flow.
 
    modal.addComponents(
      new ActionRowBuilder().addComponents(channelInput),
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(messageInput),
      new ActionRowBuilder().addComponents(colorInput),
      new ActionRowBuilder().addComponents(imageInput)
      // Footer removed to stay within Discord's 5-component limit for Modals
    );

    await interaction.showModal(modal);
  },

  modalHandlers: {
    "announce_modal:": async (interaction, client) => {
      // Security re-check at modal submit (token can be reused, so verify again)
      if (!security.isPrivileged(interaction.member)) {
        return interaction.reply({
          content: "❌ You do not have permission to send announcements.",
          ephemeral: true,
        });
      }

      const titleRaw = interaction.fields.getTextInputValue("announce_title").trim();
      const messageRaw = interaction.fields.getTextInputValue("announce_message").trim();
      const channelRaw = (interaction.fields.getTextInputValue("announce_channel") || "").trim();
      const colorRaw = (interaction.fields.getTextInputValue("announce_color") || "").trim();
      const imageRaw = (interaction.fields.getTextInputValue("announce_image") || "").trim();
      const footerRaw = ""; // Footer input removed from modal
 
      // Validate title length
      if (!titleRaw || titleRaw.length > security.LIMITS.TITLE) {
        return interaction.reply({ content: "❌ Title is invalid or too long.", ephemeral: true });
      }
 
      // Validate color
      const color = security.parseHexColor(colorRaw, config.colors.primary);
      if (color === null) {
        return interaction.reply({ content: "❌ Invalid color. Use hex format like `#FF0000`.", ephemeral: true });
      }
 
      // Resolve target channel
      let channel = interaction.channel;
      if (channelRaw) {
        const id = security.parseChannelId(channelRaw);
        if (!id) {
          return interaction.reply({ content: "❌ Invalid channel. Use a channel mention or ID.", ephemeral: true });
        }
        const found = interaction.guild.channels.cache.get(id);
        if (!found || !found.isTextBased()) {
          return interaction.reply({ content: "❌ That channel does not exist or is not a text channel.", ephemeral: true });
        }
        channel = found;
      }
 
      const title = security.truncate(titleRaw, security.LIMITS.TITLE);
      const message = security.sanitize(messageRaw);
 
      const embed = new EmbedBuilder()
        .setTitle(`📢 ${title}`)
        .setDescription(message)
        .setColor(color)
        .setThumbnail(imageRaw || null)
        .setFooter({ text: footerRaw || `Announcement by ${interaction.user.tag} | ${config.botName}` })
        .setTimestamp();
 
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        return interaction.reply({
          embeds: [errorEmbed("Failed to Send", `I couldn't send the announcement to ${channel}.\n\`${err.message}\``)],
          ephemeral: true,
        });
      }
 
      await interaction.reply({
        embeds: [modEmbed("📢 Announcement Sent", `Announcement sent to ${channel}.`)],
        ephemeral: true,
      });
    },
  },
};
