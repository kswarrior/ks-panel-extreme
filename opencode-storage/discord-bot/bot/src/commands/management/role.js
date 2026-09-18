const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const { modEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add or remove a role from a member")
    .addUserOption((o) =>
      o.setName("user").setDescription("The target user").setRequired(true)
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("The role to add/remove").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("action")
        .setDescription("Add or remove the role")
        .setRequired(true)
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" }
        )
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const role = interaction.options.getRole("role");
    const action = interaction.options.getString("action");
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) return interaction.reply({ content: "❌ User not found.", ephemeral: true });

    try {
      if (action === "add") {
        await member.roles.add(role);
        await interaction.reply({ embeds: [modEmbed("✅ Role Added", `Added ${role} to <@${user.id}>`)] });
      } else {
        await member.roles.remove(role);
        await interaction.reply({ embeds: [modEmbed("➖ Role Removed", `Removed ${role} from <@${user.id}>`)] });
      }
    } catch (err) {
      await interaction.reply({ content: `❌ Failed: ${err.message}`, ephemeral: true });
    }
  },
};