const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const config = require("../../config");
const { modEmbed, successEmbed } = require("../../utils/embed");
const guildConfigDB = require("../../utils/database/guildconfig");

const VERIFICATION_STORE = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Set up or use the verification system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Set up verification in a channel")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel for verify panel").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role given on verify").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Reset a user's verification (force re-verify)")
        .addUserOption((o) => o.setName("user").setDescription("User to reset").setRequired(true))
    ),

  buttonHandlers: {
    verify_button: async (interaction, client) => {
      const guildConfig = client.guildConfig?.get(interaction.guild.id);
      const verifyRoleId = guildConfig?.verifyRoleId;
      if (!verifyRoleId) return interaction.reply({ content: "Verification not configured.", ephemeral: true });

      const role = interaction.guild.roles.cache.get(verifyRoleId);
      if (!role) return interaction.reply({ content: "Verify role not found.", ephemeral: true });

      if (interaction.member.roles.cache.has(verifyRoleId)) {
        return interaction.reply({ content: "You are already verified!", ephemeral: true });
      }

      const captcha = Math.random().toString(36).substring(2, 8).toUpperCase();
      VERIFICATION_STORE.set(interaction.user.id, { captcha, expires: Date.now() + 120000 });

      const modal = new ModalBuilder()
        .setCustomId(`verify_captcha_${interaction.user.id}`)
        .setTitle("Verification Captcha");

      const input = new TextInputBuilder()
        .setCustomId("captcha_input")
        .setLabel(`Type this code: ${captcha}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setPlaceholder("Enter the captcha code shown above...");

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
    },
  },

  modalHandlers: {
    verify_captcha_: async (interaction, client) => {
      const userId = interaction.customId.replace("verify_captcha_", "");
      const stored = VERIFICATION_STORE.get(userId);
      const userInput = interaction.fields.getTextInputValue("captcha_input").trim().toUpperCase();

      if (!stored) {
        return interaction.reply({ content: "❌ Verification session expired. Please click the verify button again.", ephemeral: true });
      }

      VERIFICATION_STORE.delete(userId);

      if (Date.now() > stored.expires) {
        return interaction.reply({ content: "❌ Verification timed out. Please try again.", ephemeral: true });
      }

      if (userInput !== stored.captcha) {
        return interaction.reply({ content: "❌ Incorrect code. Please try again with the verify button.", ephemeral: true });
      }

      const guildConfig = client.guildConfig?.get(interaction.guild.id);
      const verifyRoleId = guildConfig?.verifyRoleId;
      if (!verifyRoleId) return interaction.reply({ content: "Verification not configured.", ephemeral: true });

      const role = interaction.guild.roles.cache.get(verifyRoleId);
      if (!role) return interaction.reply({ content: "Verify role not found.", ephemeral: true });

      try {
        await interaction.member.roles.add(role);
        await interaction.reply({ content: "✅ You have been verified! Welcome to the server.", ephemeral: true });
      } catch {
        await interaction.reply({ content: "❌ Failed to assign the role. Contact an admin.", ephemeral: true });
      }
    },
  },

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
      const channel = interaction.options.getChannel("channel");
      const role = interaction.options.getRole("role");

      client.guildConfig = client.guildConfig || new Map();
      const gc = client.guildConfig.get(interaction.guild.id) || {};
      gc.verifyRoleId = role.id;
      client.guildConfig.set(interaction.guild.id, gc);

      const embed = new EmbedBuilder()
        .setTitle("✅ Server Verification")
        .setDescription("Click the button below to verify yourself and gain access to the server!\n\nYou will need to complete a simple captcha to prove you are human.")
        .setColor(config.colors.primary)
        .setFooter({ text: `${config.botName} | KS Hub` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("verify_button").setLabel("✅ Verify Me").setStyle(ButtonStyle.Success)
      );

      await channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ embeds: [successEmbed("Verification Set Up", `Verify panel in ${channel}\nRole: ${role}`)], ephemeral: true });
    }

    else if (sub === "reset") {
      const user = interaction.options.getUser("user");
      const guildConfig = client.guildConfig?.get(interaction.guild.id);
      const verifyRoleId = guildConfig?.verifyRoleId;
      if (!verifyRoleId) return interaction.reply({ content: "Verification not configured.", ephemeral: true });

      const member = interaction.guild.members.cache.get(user.id);
      if (member.roles.cache.has(verifyRoleId)) {
        await member.roles.remove(verifyRoleId);
        await interaction.reply({ embeds: [modEmbed("Verification Reset", `<@${user.id}> has been un-verified and must re-verify.`)] });
      } else {
        await interaction.reply({ content: "That user is not verified.", ephemeral: true });
      }
    }
  },
};
