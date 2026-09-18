const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

const truths = [
  "What is your biggest fear?", "What is the most embarrassing thing you've ever done?",
  "Who do you have a crush on?", "What is the last lie you told?",
  "What is the most embarrassing thing in your room?", "What is the worst habit you have?",
  "What is a secret you've never told anyone?", "What is the most childish thing you still do?",
  "Have you ever lied to get out of trouble?", "What is the biggest mistake you've ever made?",
  "What is one thing you wish you could change about yourself?", "What is the craziest thing you've ever done?",
];

const dares = [
  "Do your best impression of someone in this server.", "Send the 5th emoji in your recent list.",
  "Type a message without using the letter 'e'.", "Say something nice to the person above you.",
  "Change your nickname to something funny for 10 minutes.", "Share the last image you saved.",
  "Do 10 jumping jacks and tell us when you're done.", "Sing the chorus of the last song you listened to.",
  "Let the next person choose your profile picture for an hour.", "Send a funny meme from your gallery.",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("truthordare")
    .setDescription("Play Truth or Dare!")
    .addStringOption((o) =>
      o
        .setName("choice")
        .setDescription("Truth or Dare?")
        .setRequired(true)
        .addChoices({ name: "Truth", value: "truth" }, { name: "Dare", value: "dare" }, { name: "Random", value: "random" })
    ),

  async execute(interaction) {
    const choice = interaction.options.getString("choice");
    let selected;

    if (choice === "truth") selected = truths[Math.floor(Math.random() * truths.length)];
    else if (choice === "dare") selected = dares[Math.floor(Math.random() * dares.length)];
    else {
      const all = [...truths.map((t) => ({ type: "Truth", text: t })), ...dares.map((d) => ({ type: "Dare", text: d }))];
      const pick = all[Math.floor(Math.random() * all.length)];
      selected = pick;
    }

    const isRandom = choice === "random";
    const type = isRandom ? selected.type : choice === "truth" ? "Truth" : "Dare";
    const text = isRandom ? selected.text : selected;
    const emoji = type === "Truth" ? "🤔" : "🔥";

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${type}!`)
      .setDescription(text)
      .setColor(type === "Truth" ? 0x5865f2 : 0xf47fff)
      .setFooter({ text: `Requested by ${interaction.user.tag} | ${config.botName}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};