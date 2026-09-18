const { get: dbGet } = require('../database');
const db = dbGet('guildconfig');

db.pragma('foreign_keys = ON');

// Table for server specific configuration (welcome, leave, boost, modlog, autorole, ticket settings)
// All columns are optional (NULL allowed)

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guildId TEXT PRIMARY KEY,
  welcomeChannelId TEXT,
  leaveChannelId TEXT,
  boostChannelId TEXT,
  modLogChannelId TEXT,
  autoRoleId TEXT,
  ticketCategoryId TEXT,
  ticketChannelId TEXT,
  ticketSupportRoleId TEXT,
  ticketPanelTitle TEXT,
  ticketPanelDescription TEXT,
  ticketPanelColor INTEGER
);
`);

// Light migration: add ticket panel columns to any pre-existing table that
// was created before they existed (CREATE TABLE IF NOT EXISTS won't add them).
const existingCols = new Set(db.prepare("PRAGMA table_info(guild_config)").all().map((c) => c.name));
const addCols = [
  ["ticketPanelTitle", "TEXT"],
  ["ticketPanelDescription", "TEXT"],
  ["ticketPanelColor", "INTEGER"],
];
for (const [col, type] of addCols) {
  if (!existingCols.has(col)) {
    db.exec(`ALTER TABLE guild_config ADD COLUMN ${col} ${type}`);
  }
}

function get(guildId) {
  return db.prepare('SELECT * FROM guild_config WHERE guildId = ?').get(guildId) || {};
}

function set(guildId, data) {
  // Upsert – insert if not exists else update
  const existing = db.prepare('SELECT 1 FROM guild_config WHERE guildId = ?').get(guildId);
  if (existing) {
    const fields = Object.keys(data);
    const assignments = fields.map(f => `${f} = @${f}`).join(', ');
    const stmt = db.prepare(`UPDATE guild_config SET ${assignments} WHERE guildId = @guildId`);
    stmt.run({ guildId, ...data });
  } else {
    const fields = ['guildId', ...Object.keys(data)];
    const placeholders = fields.map(f => `@${f}`).join(', ');
    const stmt = db.prepare(`INSERT INTO guild_config (${fields.join(', ')}) VALUES (${placeholders})`);
    stmt.run({ guildId, ...data });
  }
}

// Read ticket system config for a guild as the same map shape used at runtime.
function getTicketConfig(guildId) {
  const row = get(guildId);
  if (!row || !row.ticketChannelId || !row.ticketCategoryId || !row.ticketSupportRoleId) return null;
  return {
    channelId: row.ticketChannelId,
    categoryId: row.ticketCategoryId,
    supportRoleId: row.ticketSupportRoleId,
    panelTitle: row.ticketPanelTitle || null,
    panelDescription: row.ticketPanelDescription || null,
    panelColor: row.ticketPanelColor != null ? row.ticketPanelColor : null,
  };
}

module.exports = { get, set, getTicketConfig };
