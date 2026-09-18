const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { modEmbed, errorEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("Change a member's nickname")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((o) =>
      o.setName("user").setDescription("The target user").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("nickname").setDescription("New nickname (leave empty to reset)").setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const nickname = interaction.options.getString("nickname");
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) return interaction.reply({ embeds: [errorEmbed("Error", "User not found.")], ephemeral: true });

    try {
      await member.setNickname(nickname);
      await interaction.reply({ embeds: [modEmbed("✏️ Nickname Changed", `<@${user.id}>'s nickname is now **${nickname || "reset"}**.`)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Error", `Failed: ${err.message}`)], ephemeral: true });
    }
  },
};