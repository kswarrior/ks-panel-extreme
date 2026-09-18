const { get: dbGet } = require('../database');
const db = dbGet('warnings');

db.pragma('foreign_keys = ON');

// Table to store warnings per guild/user
// warningId autoincrement for uniqueness per guild/user

db.exec(`
CREATE TABLE IF NOT EXISTS warnings (
  guildId TEXT NOT NULL,
  userId TEXT NOT NULL,
  warningId INTEGER NOT NULL,
  reason TEXT NOT NULL,
  moderator TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  PRIMARY KEY (guildId, userId, warningId)
);
`);

function add(guildId, userId, reason, moderator) {
  // Determine next warningId for this guild/user
  const row = db.prepare('SELECT MAX(warningId) as maxId FROM warnings WHERE guildId = ? AND userId = ?').get(guildId, userId);
  const nextId = (row.maxId || 0) + 1;
  db.prepare('INSERT INTO warnings (guildId, userId, warningId, reason, moderator, timestamp) VALUES (?,?,?,?,?,?)')
    .run(guildId, userId, nextId, reason, moderator, Date.now());
  return nextId;
}

function list(guildId, userId) {
  return db.prepare('SELECT warningId, reason, moderator, timestamp FROM warnings WHERE guildId = ? AND userId = ? ORDER BY warningId').all(guildId, userId);
}

function remove(guildId, userId, warningId) {
  const info = db.prepare('DELETE FROM warnings WHERE guildId = ? AND userId = ? AND warningId = ?').run(guildId, userId, warningId);
  return info.changes > 0;
}

function clear(guildId, userId) {
  db.prepare('DELETE FROM warnings WHERE guildId = ? AND userId = ?').run(guildId, userId);
}

module.exports = { add, list, remove, clear };
