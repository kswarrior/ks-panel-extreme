const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const economy = require("../../utils/economy");

const JOBS = [
  { name: "Software Developer", minEarn: 150, maxEarn: 300, cooldown: 60 },
  { name: "Graphic Designer", minEarn: 100, maxEarn: 250, cooldown: 45 },
  { name: "Teacher", minEarn: 80, maxEarn: 200, cooldown: 40 },
  { name: "Doctor", minEarn: 200, maxEarn: 400, cooldown: 90 },
  { name: "Chef", minEarn: 70, maxEarn: 180, cooldown: 35 },
  { name: "Engineer", minEarn: 180, maxEarn: 350, cooldown: 75 },
  { name: "Artist", minEarn: 60, maxEarn: 150, cooldown: 30 },
  { name: "Writer", minEarn: 90, maxEarn: 220, cooldown: 50 },
  { name: "Musician", minEarn: 100, maxEarn: 250, cooldown: 55 },
  { name: "Gamer", minEarn: 50, maxEarn: 120, cooldown: 25 },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Work to earn KS Hub Credits"),

  async execute(interaction) {
    const userData = economy.getOrCreateUser(interaction.user.id);
    const now = Date.now();

    // Choose a random job first – its specific cooldown will be used for the check.
    const job = JOBS[Math.floor(Math.random() * JOBS.length)];
    const jobCooldownMs = job.cooldown * 60 * 1000; // minutes to ms

    if (userData.lastWork && now - userData.lastWork < jobCooldownMs) {
      const remaining = jobCooldownMs - (now - userData.lastWork);
      const minutes = Math.floor(remaining / (60 * 1000));
      const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

      const embed = new EmbedBuilder()
        .setTitle("⏰ Working Cooldown")
        .setDescription(`You're still working! Take a break.`)
        .addFields({ name: "Back to work in", value: `${minutes}m ${seconds}s`, inline: true })
        .setColor(config.colors.warning)
        .setFooter({ text: `${config.botName} | Work` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // Proceed with earning based on the selected job.
    const earned = Math.floor(Math.random() * (job.maxEarn - job.minEarn + 1)) + job.minEarn;
    const newBalance = economy.addBalance(interaction.user.id, earned);
    economy.setCooldown(interaction.user.id, "lastWork", now);

    const embed = new EmbedBuilder()
      .setTitle("💼 Work Complete!")
      .setDescription(`You worked as a **${job.name}** and earned **${earned.toLocaleString()} KC**!`)
      .addFields(
        { name: "New Balance", value: `${newBalance.toLocaleString()} KC`, inline: true },
        { name: "Job", value: job.name, inline: true },
        { name: "Cooldown", value: `${job.cooldown} minutes`, inline: true }
      )
      .setColor(config.colors.success)
      .setFooter({ text: `${config.botName} | Work` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};