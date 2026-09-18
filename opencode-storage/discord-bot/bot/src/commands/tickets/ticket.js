const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const config = require("../../config");
const { successEmbed, errorEmbed } = require("../../utils/embed");
const security = require("../../utils/security");
const guildConfigDB = require("../../utils/database/guildconfig");

module.exports = {
   data: new SlashCommandBuilder()
     .setName("ticket-setup")
     .setDescription("Set up the ticket system via a form")
     .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
     .addChannelOption((opt) =>
       opt
         .setName("channel")
         .setDescription("Panel channel (text channel)")
         .addChannelTypes(ChannelType.GuildText)
         .setRequired(true)
     )
     .addChannelOption((opt) =>
       opt
         .setName("category")
         .setDescription("Category where tickets will be created")
         .addChannelTypes(ChannelType.GuildCategory)
         .setRequired(true)
     )
     .addRoleOption((opt) =>
       opt.setName("supportrole").setDescription("Role that will be mentioned for support").setRequired(true)
     ),

  buttonHandlers: {
    ticket_create: async (interaction, client) => {
      const guildConfig = client.ticketConfig?.get(interaction.guild.id);
      if (!guildConfig) {
        return interaction.reply({
          embeds: [errorEmbed("Not Configured", "Ticket system is not configured. Ask an admin to run `/ticket-setup`." )],
          ephemeral: true,
        });
      }

      const existingChannel = interaction.guild.channels.cache.find(
        (c) => c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}` && c.parentId === guildConfig.categoryId
      );
      if (existingChannel) {
        return interaction.reply({
          embeds: [errorEmbed("Already Open", `You already have an open ticket: ${existingChannel}`)],
          ephemeral: true,
        });
      }
      try {
        await interaction.deferReply({ ephemeral: true });
 
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          type: ChannelType.GuildText,
          parent: guildConfig.categoryId,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: ["ViewChannel"] },
            { id: interaction.user.id, allow: ["ViewChannel", "SendMessages", "AttachFiles", "EmbedLinks"] },
            { id: guildConfig.supportRoleId, allow: ["ViewChannel", "SendMessages", "ManageMessages", "ManageChannels"] },
          ],
        });
 
        const ticketEmbed = new EmbedBuilder()
          .setTitle("🎫 Support Ticket")
          .setDescription(
            `Welcome <@${interaction.user.id}>!\n\n` +
            `Please describe your issue in detail.\n` +
            `Our support team (<@&${guildConfig.supportRoleId}>) will assist you shortly.\n\n` +
            `⚠️ Please do not ping staff members directly.`
          )
          .setColor(config.colors.info)
          .setFooter({ text: `${config.botName} | KS Hub` })
          .setTimestamp();
 
        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Close Ticket").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ticket_transcript").setLabel("📝 Save Transcript").setStyle(ButtonStyle.Secondary)
        );
 
        // Send the embed and button row separately.
        try {
          await ticketChannel.send({ embeds: [ticketEmbed] });
          await ticketChannel.send({ components: [closeRow] });
        } catch (sendErr) {
          return interaction.editReply({
            embeds: [errorEmbed("Failed to Send", `I couldn't send the ticket embed or buttons to ${ticketChannel}.\n\`${sendErr.message}\``)],
            ephemeral: true,
          });
        }
        await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}` });
      } catch (err) {
        return interaction.reply({
          embeds: [errorEmbed("Creation Failed", `An error occurred while creating the ticket: \`${err.message}\``)],
          ephemeral: true,
        });
      }
    },

    ticket_close: async (interaction, client) => {
      if (!interaction.channel.name.startsWith("ticket-")) {
        return interaction.reply({ content: "This is not a ticket channel.", ephemeral: true });
      }

      const closeEmbed = new EmbedBuilder()
        .setTitle("🔒 Ticket Closing")
        .setDescription("This ticket will be deleted in 5 seconds...\nClick 📝 Save Transcript first if you need a record.")
        .setColor(config.colors.error)
        .setTimestamp();

      await interaction.reply({ embeds: [closeEmbed] });

      setTimeout(async () => {
        await interaction.channel.delete().catch(() => {});
      }, 5000);
    },

    ticket_transcript: async (interaction, client) => {
      if (!interaction.channel.name.startsWith("ticket-")) {
        return interaction.reply({ content: "This is not a ticket channel.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const transcript = messages
        .reverse()
        .map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || "(embed/attachment)"}`)
        .join("\n");

      const { AttachmentBuilder } = require("discord.js");
      const attachment = new AttachmentBuilder(Buffer.from(transcript, "utf-8"), { name: `transcript-${interaction.channel.name}.txt` });

      await interaction.editReply({ content: "📝 Here is the ticket transcript:", files: [attachment] });
    },
  },

  async execute(interaction, client) {
    // Security: only privileged members may set up the ticket system
    if (!security.isPrivileged(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed("Not Allowed", "You need the **Manage Server** permission to use this command.")],
        ephemeral: true,
      });
    }

    // Retrieve slash options (channel, category, role) and store them for the modal submit
    const panelChannel = interaction.options.getChannel("channel", true);
    const category = interaction.options.getChannel("category", true);
    const supportRole = interaction.options.getRole("supportrole", true);

    // Store a short-lived pending setup entry keyed by the invoking user
    client.pendingTicketSetup = client.pendingTicketSetup || new Map();
    client.pendingTicketSetup.set(interaction.user.id, {
      panelChannelId: panelChannel.id,
      categoryId: category.id,
      supportRoleId: supportRole.id,
    });

    const modalId = `ticket_setup_modal:${interaction.guild.id}:${interaction.user.id}`;
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("🎫 Ticket Panel Settings");

    const titleInput = new TextInputBuilder()
      .setCustomId("ts_title")
      .setLabel("Panel title (optional)")
      .setPlaceholder("🎫 Support Tickets")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(security.LIMITS.TITLE)
      .setRequired(false);

    const descInput = new TextInputBuilder()
      .setCustomId("ts_desc")
      .setLabel("Panel description (optional)")
      .setPlaceholder("Need help? Click the button below to create a support ticket!")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(security.LIMITS.MESSAGE)
      .setRequired(false);

    const colorInput = new TextInputBuilder()
      .setCustomId("ts_color")
      .setLabel("Panel color hex (optional, e.g., #5865F2)")
      .setPlaceholder("#5865F2")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(7)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(colorInput)
    );

    await interaction.showModal(modal);
  },

  modalHandlers: {
    // Updated modal handler for combined slash/ modal flow
    "ticket_setup_modal:": async (interaction, client) => {
      // Verify that the modal matches the pending setup for the user
      const [, guildId, userId] = interaction.customId.split(":");
      if (interaction.guild.id !== guildId || interaction.user.id !== userId) {
        return interaction.reply({
          embeds: [errorEmbed("Invalid", "Your modal data does not match the current session.")],
          ephemeral: true,
        });
      }

      const pending = client.pendingTicketSetup?.get(userId);
      if (!pending) {
        return interaction.reply({
          embeds: [errorEmbed("Expired", "Setup session expired – please run `/ticket-setup` again.")],
          ephemeral: true,
        });
      }
      client.pendingTicketSetup.delete(userId);
      const { panelChannelId, categoryId, supportRoleId } = pending;

      const titleRaw = (interaction.fields.getTextInputValue("ts_title") || "").trim();
      const descRaw = (interaction.fields.getTextInputValue("ts_desc") || "").trim();
      const colorRaw = (interaction.fields.getTextInputValue("ts_color") || "").trim();

      const title = security.truncate(titleRaw || "🎫 Support Tickets", security.LIMITS.TITLE);
      const description = security.sanitize(
        descRaw || "Need help? Click the button below to create a support ticket!\n\nOur support team will assist you as soon as possible."
      );
      const color = security.parseHexColor(colorRaw, config.colors.primary);

      // Update runtime config
      client.ticketConfig = client.ticketConfig || new Map();
      client.ticketConfig.set(interaction.guild.id, {
        channelId: panelChannelId,
        categoryId,
        supportRoleId,
        panelTitle: title,
        panelDescription: description,
        panelColor: color,
      });

      // Persist to DB
      guildConfigDB.set(interaction.guild.id, {
        ticketChannelId: panelChannelId,
        ticketCategoryId: categoryId,
        ticketSupportRoleId: supportRoleId,
        ticketPanelTitle: title,
        ticketPanelDescription: description,
        ticketPanelColor: color,
      });

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: `${config.botName} | KS Hub` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_create").setLabel("🎫 Create Ticket").setStyle(ButtonStyle.Primary)
      );

      const channel = interaction.guild.channels.cache.get(panelChannelId);
      try {
        await channel.send({ embeds: [embed], components: [row] });
      } catch (err) {
        return interaction.reply({
          embeds: [errorEmbed("Failed to Send", `I couldn't send the ticket panel to ${channel}.\n\`${err.message}\``)],
          ephemeral: true,
        });
      }

      await interaction.reply({
        embeds: [
          successEmbed(
            "Ticket System Set Up",
            `Panel created in ${channel}\nCategory: **${interaction.guild.channels.cache.get(categoryId).name}**\nSupport role: <@&${supportRoleId}>`
          ),
        ],
        ephemeral: true,
      });
    },
  },
};