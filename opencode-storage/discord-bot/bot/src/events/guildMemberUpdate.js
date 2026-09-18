module.exports = {
  name: "guildMemberUpdate",

  async execute(oldMember, newMember, client) {
    const welcomeCmd = require("../commands/management/welcomesystem");
    if (welcomeCmd.handleGuildMemberUpdate) {
      await welcomeCmd.handleGuildMemberUpdate(oldMember, newMember, client);
    }
  },
};