const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { errorEmbed, modEmbed } = require("../../utils/embed");
const { resolveMember, canActOn } = require("../../utils/moderation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Check remaining timeout for a member")
    .addUserOption((o) => o.setName("user").setDescription("User to check").setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const member = await resolveMember(interaction.guild, user.id);
    if (!member) return interaction.reply({ content: "User not found.", ephemeral: true });
    if (!member.isCommunicationDisabled()) return interaction.reply({ content: `<@${user.id}> is not timed out.`, ephemeral: true });

    const until = Math.floor(new Date(member.communicationDisabledUntil).getTime() / 1000);
    await interaction.reply({ embeds: [new (require("discord.js").EmbedBuilder)().setTitle("Timeout Status").setDescription(`<@${user.id}> until <t:${until}:F> (<t:${until}:R>)`).setColor(0xfee75c).setFooter({ text: require("../../config").botName }).setTimestamp()] });
  },
};
