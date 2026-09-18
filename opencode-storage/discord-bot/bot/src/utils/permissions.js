const { PermissionsBitField } = require("discord.js");
const config = require("../config");

function isOwner(userId) {
  return userId === config.ownerId;
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function canModerate(member) {
  return (
    isAdmin(member) ||
    member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
    member.permissions.has(PermissionsBitField.Flags.KickMembers) ||
    member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
    member.permissions.has(PermissionsBitField.Flags.ManageMessages)
  );
}

function canManageServer(member) {
  return (
    isAdmin(member) ||
    member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions.has(PermissionsBitField.Flags.ManageRoles)
  );
}

function checkRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

function getRoleID(member, roleName) {
  return member.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
}

module.exports = { isOwner, isAdmin, canModerate, canManageServer, checkRole, getRoleID };