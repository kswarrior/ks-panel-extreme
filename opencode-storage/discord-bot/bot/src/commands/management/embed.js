const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require("discord.js");
const { createEmbed } = require("../../utils/embed");
const security = require("../../utils/security");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Send a custom embed message via a form")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!security.isPrivileged(interaction.member)) {
      return interaction.reply({ content: "❌ You do not have permission to use this command!", ephemeral: true });
    }

    const modalId = `embed_modal:${interaction.guild.id}:${interaction.user.id}`;
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle("🎨 Create Custom Embed");

    const titleInput = new TextInputBuilder()
      .setCustomId("embed_title")
      .setLabel("Title")
      .setPlaceholder("Enter embed title...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId("embed_desc")
      .setLabel("Description")
      .setPlaceholder("Enter embed description...")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const colorInput = new TextInputBuilder()
      .setCustomId("embed_color")
      .setLabel("Color (Hex)")
      .setPlaceholder("#5865F2")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const imageInput = new TextInputBuilder()
      .setCustomId("embed_image")
      .setLabel("Image URL")
      .setPlaceholder("https://...")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const footerInput = new TextInputBuilder()
      .setCustomId("embed_footer")
      .setLabel("Footer")
      .setPlaceholder("Footer text...")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(colorInput),
      new ActionRowBuilder().addComponents(imageInput),
      new ActionRowBuilder().addComponents(footerInput)
    );

    await interaction.showModal(modal);
  },

  modalHandlers: {
    "embed_modal:": async (interaction) => {
      const title = interaction.fields.getTextInputValue("embed_title");
      const desc = interaction.fields.getTextInputValue("embed_desc");
      const colorRaw = interaction.fields.getTextInputValue("embed_color") || "";
      const image = interaction.fields.getTextInputValue("embed_image") || "";
      const footer = interaction.fields.getTextInputValue("embed_footer") || "";

      const color = colorRaw ? parseInt(colorRaw.replace("#", ""), 16) : 0x5865F2;
      
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(color)
        .setImage(image || null)
        .setFooter({ text: footer || "Custom Embed" })
        .setTimestamp();

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: "✅ Embed sent successfully!", ephemeral: true });
    },
  },
};