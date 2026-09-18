const { get: dbGet } = require('../database');
const db = dbGet('leveling');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Table for XP/level per user per guild
db.exec(`
CREATE TABLE IF NOT EXISTS user_levels (
  guildId TEXT NOT NULL,
  userId TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  lastXP INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guildId, userId)
);
`);

/** Get level record – returns null if not exists */
function get(guildId, userId) {
  return db.prepare('SELECT * FROM user_levels WHERE guildId = ? AND userId = ?').get(guildId, userId);
}
/** Ensure a record exists and return it */
function getOrCreate(guildId, userId) {
  let row = get(guildId, userId);
  if (!row) {
    db.prepare('INSERT INTO user_levels (guildId, userId) VALUES (?, ?)').run(guildId, userId);
    row = get(guildId, userId);
  }
  return row;
}
/** Update XP and possibly level – returns {leveled:true, level, xp, required} if leveled up, otherwise null */
function addXP(guildId, userId, xpGain, levelCooldown) {
  const now = Date.now();
  const rec = getOrCreate(guildId, userId);
  if (now - rec.lastXP < levelCooldown) return null; // cooldown not passed
  const newXP = rec.xp + xpGain;
  const newLast = now;
  db.prepare('UPDATE user_levels SET xp = ?, lastXP = ? WHERE guildId = ? AND userId = ?').run(newXP, newLast, guildId, userId);
  // Check for level up
  let level = rec.level;
  let xp = newXP;
  const xpFor = (lvl) => Math.floor(100 * Math.pow(lvl, 1.5));
  let leveled = false;
  while (xp >= xpFor(level)) {
    xp -= xpFor(level);
    level++;
    leveled = true;
  }
  if (leveled) {
    db.prepare('UPDATE user_levels SET xp = ?, level = ? WHERE guildId = ? AND userId = ?').run(xp, level, guildId, userId);
    return { leveled: true, level, xp, required: xpFor(level) };
  }
  return null;
}
/** Set a specific column – used for cooldown fields like lastDaily etc. */
function setField(guildId, userId, field, value) {
  // The user_levels table only contains xp, level, and lastXP columns.
  // If other fields are needed, the schema must be extended accordingly.
  const allowed = new Set(['xp', 'level', 'lastXP']);
  if (!allowed.has(field)) throw new Error(`Invalid field ${field}`);
  // Ensure the record exists.
  getOrCreate(guildId, userId);
  db.prepare(`UPDATE user_levels SET ${field} = ? WHERE guildId = ? AND userId = ?`).run(value, guildId, userId);
}
/** Get all users (across guilds) */
function getAll() {
  return db.prepare('SELECT * FROM user_levels').all();
}

module.exports = { get, getOrCreate, addXP, setField, getAll };
