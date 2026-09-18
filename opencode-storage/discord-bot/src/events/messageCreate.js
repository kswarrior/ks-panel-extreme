const config = require("../config");
const { Collection } = require("discord.js");
const automod = require("../commands/management/automod");
const leveling = require("../commands/utility/leveling");

module.exports = {
  name: "messageCreate",

  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Snipe map
    client.snipeMap = client.snipeMap || new Collection();
    client.snipeMap.set(message.channel.id, {
      content: message.content,
      author: message.author,
      timestamp: message.createdTimestamp,
      attachments: message.attachments.first()?.url,
    });

    // AutoMod checks
    if (await automod.trackSpam(message, client)) return;
    if (await automod.checkMassMention(message, client)) return;
    await automod.checkGhostPing(message, client);

    // Leveling/XP
    if (leveling.handleMessage) await leveling.handleMessage(message, client);
  },
};