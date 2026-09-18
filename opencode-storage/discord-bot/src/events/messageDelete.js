const { EmbedBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  name: "messageDelete",

  async execute(message, client) {
    if (message.author?.bot) return;
    if (!message.guild) return;

    client.snipeMap = client.snipeMap || new Map();
    client.snipeMap.set(message.channel.id, {
      content: message.content || "No text content",
      author: message.author,
      timestamp: Date.now(),
      attachments: message.attachments.first()?.url,
    });
  },
};