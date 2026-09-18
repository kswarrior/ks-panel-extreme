// src/utils/security.js
// Shared security helpers used by slash commands, modals and buttons.

const { PermissionFlagsBits } = require("discord.js");
const config = require("../config");

// Maximum sizes we allow from user-supplied text to avoid abusive/large payloads.
const LIMITS = {
  TITLE: 256,
  MESSAGE: 4000,
  REASON: 1000,
  NAME: 100,
  CHANNEL_ID: 20,
  ROLE_ID: 20,
  DURATION: 10,
};

// Regex helpers
const CHANNEL_ID_RE = /^<?#?(\d{17,20})>?$/;
const ROLE_ID_RE = /^<?@?&?(\d{17,20})>?$/;
const USER_MENTION_RE = /^<@!?(\d{17,20})>$/;
const HEX_COLOR_RE = /^#?([0-9a-fA-F]{6})$/;

// Basic HTML/markdown-extraction style list for sanitization (escapes everyone/here pings)
const PING_RE = /@(everyone|here)/gi;

// Is the member allowed to use a privileged command?
function isPrivileged(member) {
  if (!member) return false;
  // Bot owner always allowed
  if (member.id === config.ownerId) return true;
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

// Assert a member is privileged; throws a friendly Error if not
function requirePrivileged(member) {
  if (!isPrivileged(member)) {
    throw new Error("You do not have permission to use this command.");
  }
  return true;
}

// Validate a channel id input (accepts <#id>, #id, or raw id)
function parseChannelId(input) {
  if (!input) return null;
  const m = String(input).trim().match(CHANNEL_ID_RE);
  return m ? m[1] : null;
}

// Validate a role id input
function parseRoleId(input) {
  if (!input) return null;
  const m = String(input).trim().match(ROLE_ID_RE);
  return m ? m[1] : null;
}

// Validate a user id input
function parseUserId(input) {
  if (!input) return null;
  const m = String(input).trim().match(USER_MENTION_RE);
  return m ? m[1] : null;
}

// Validate and parse a hex color (#RRGGBB)
function parseHexColor(input, fallback = config.colors.primary) {
  if (!input) return fallback;
  const m = String(input).trim().match(HEX_COLOR_RE);
  if (!m) return null; // null == invalid
  return parseInt(m[1], 16);
}

// Strip ping-triggering characters to prevent accidental mass-ping escalation
function sanitize(text) {
  if (text == null) return "";
  return String(text)
    .replace(PING_RE, "@\u200b$1")
    .slice(0, LIMITS.MESSAGE);
}

// Truncate to a given max with ellipsis
function truncate(text, max = LIMITS.MESSAGE) {
  const s = String(text == null ? "" : text);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

module.exports = {
  LIMITS,
  isPrivileged,
  requirePrivileged,
  parseChannelId,
  parseRoleId,
  parseUserId,
  parseHexColor,
  sanitize,
  truncate,
};
