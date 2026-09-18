const { PermissionFlagsBits } = require("discord.js");

async function resolveMember(guild, userId) {
  let member = guild.members.cache.get(userId);
  if (!member) {
    try { member = await guild.members.fetch(userId); } catch { return null; }
  }
  return member;
}

function canActOn(actor, target, guild) {
  if (target.id === guild.ownerId) return { ok: false, reason: "Cannot act on the server owner." };
  if (actor.isOwner && actor.permissions.has(PermissionFlagsBits.Administrator)) return { ok: true };
  if (target.roles.highest.position >= actor.roles.highest.position) {
    return { ok: false, reason: "Target has an equal or higher role." };
  }
  return { ok: true };
}

module.exports = { resolveMember: resolveMember, canActOn };
