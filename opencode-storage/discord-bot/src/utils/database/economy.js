const { DB_DIR } = require('../database');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(DB_DIR, 'economy.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -20000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    daily INTEGER NOT NULL DEFAULT 0,
    lastDaily INTEGER,
    lastWork INTEGER,
    lastBeg INTEGER,
    lastRob INTEGER,
    totalEarned INTEGER NOT NULL DEFAULT 0,
    totalSpent INTEGER NOT NULL DEFAULT 0,
    messageCount INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS inventory (
    userId TEXT NOT NULL,
    itemId TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (userId, itemId),
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS badges (
    userId TEXT NOT NULL,
    badgeId TEXT NOT NULL,
    PRIMARY KEY (userId, badgeId),
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
  );
`);

function withRetry(fn, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return fn(); }
    catch (e) {
      const msg = (e && typeof e === 'object' ? (e.message || '') : String(e));
      if (msg.includes('database is locked') || e.code === 'SQLITE_BUSY') {
        const backoff = Math.min(50 * Math.pow(2, attempt), 500);
        const start = Date.now();
        while (Date.now() - start < backoff) {}
        continue;
      }
      throw e;
    }
  }
}

module.exports = {
  getUser(userId) {
    return withRetry(() => db.prepare('SELECT * FROM users WHERE userId = ?').get(userId)) || null;
  },

  getOrCreateUser(userId) {
    withRetry(() => db.prepare('INSERT OR IGNORE INTO users (userId) VALUES (?)').run(userId));
    return this.getUser(userId);
  },

  addBalance(userId, amount) {
    if (amount <= 0) return this.getUser(userId)?.balance ?? 0;
    return withRetry(() => {
      db.prepare('INSERT OR IGNORE INTO users (userId) VALUES (?)').run(userId);
      db.prepare('UPDATE users SET balance = balance + ?, totalEarned = totalEarned + ? WHERE userId = ?').run(amount, amount, userId);
      return db.prepare('SELECT balance FROM users WHERE userId = ?').get(userId).balance;
    });
  },

  removeBalance(userId, amount) {
    if (amount <= 0) return 0;
    return withRetry(() => {
      db.prepare('INSERT OR IGNORE INTO users (userId) VALUES (?)').run(userId);
      const row = db.prepare('SELECT balance FROM users WHERE userId = ?').get(userId);
      if ((row && row.balance < amount) || !row) return -1;
      db.prepare('UPDATE users SET balance = balance - ?, totalSpent = totalSpent + ? WHERE userId = ?').run(amount, amount, userId);
      return db.prepare('SELECT balance FROM users WHERE userId = ?').get(userId).balance;
    });
  },

  setBalance(userId, amount) {
    withRetry(() => {
      db.prepare('INSERT OR IGNORE INTO users (userId) VALUES (?)').run(userId);
      db.prepare('UPDATE users SET balance = ? WHERE userId = ?').run(amount, userId);
    });
    return amount;
  },

  addItem(userId, itemId, quantity = 1) {
    withRetry(() => {
      db.prepare('INSERT INTO inventory (userId, itemId, quantity) VALUES (?, ?, ?) ON CONFLICT(userId, itemId) DO UPDATE SET quantity = quantity + excluded.quantity').run(userId, itemId, quantity);
    });
  },

  removeItem(userId, itemId, quantity = 1) {
    return withRetry(() => {
      const existing = db.prepare('SELECT quantity FROM inventory WHERE userId = ? AND itemId = ?').get(userId, itemId);
      if (!existing || existing.quantity < quantity) return false;
      const newQty = existing.quantity - quantity;
      if (newQty <= 0) db.prepare('DELETE FROM inventory WHERE userId = ? AND itemId = ?').run(userId, itemId);
      else db.prepare('UPDATE inventory SET quantity = ? WHERE userId = ? AND itemId = ?').run(newQty, userId, itemId);
      return true;
    });
  },

  hasItem(userId, itemId) {
    return !!withRetry(() => db.prepare('SELECT 1 FROM inventory WHERE userId = ? AND itemId = ?').get(userId, itemId));
  },

  addBadge(userId, badgeId) {
    withRetry(() => {
      db.prepare('INSERT OR IGNORE INTO badges (userId, badgeId) VALUES (?, ?)').run(userId, badgeId);
    });
  },

  setCooldown(userId, field, value) {
    const allowed = new Set(['lastDaily','lastWork','lastBeg','lastRob','daily','balance','totalEarned','totalSpent','messageCount']);
    if (!allowed.has(field)) throw new Error(`Invalid field '${field}'`);
    withRetry(() => {
      db.prepare('INSERT OR IGNORE INTO users (userId) VALUES (?)').run(userId);
      db.prepare(`UPDATE users SET ${field} = ? WHERE userId = ?`).run(value, userId);
    });
  },

  getAllUsers() {
    return withRetry(() => {
      const users = db.prepare('SELECT * FROM users').all();
      const inventories = db.prepare('SELECT userId, itemId as id, quantity FROM inventory').all();
      const badges = db.prepare('SELECT userId, badgeId as id FROM badges').all();
      const invMap = {};
      for (const row of inventories) {
        (invMap[row.userId] = invMap[row.userId] || []).push({ id: row.id, quantity: row.quantity });
      }
      const badgeMap = {};
      for (const row of badges) {
        (badgeMap[row.userId] = badgeMap[row.userId] || []).push(row.id);
      }
      return users
        .filter(u => u.userId !== require('../../config').ownerId)
        .map(u => ({
          userId: u.userId,
          ...u,
          inventory: invMap[u.userId] || [],
          badges: badgeMap[u.userId] || [],
        }));
    });
  },

  updateUser(userId, updater) {
    withRetry(() => {
      const user = this.getUser(userId) || {
        userId, balance: 0, daily: 0, lastDaily: null, lastWork: null,
        lastBeg: null, lastRob: null, totalEarned: 0, totalSpent: 0, messageCount: 0,
      };
      const mutable = {
        balance:       user.balance ?? 0,
        daily:         user.daily ?? 0,
        lastDaily:     user.lastDaily ?? null,
        lastWork:      user.lastWork ?? null,
        lastBeg:       user.lastBeg ?? null,
        lastRob:       user.lastRob ?? null,
        totalEarned:   user.totalEarned ?? 0,
        totalSpent:    user.totalSpent ?? 0,
        messageCount:  user.messageCount ?? 0,
      };
      updater(mutable);
      db.prepare(
        'UPDATE users SET balance=?,daily=?,lastDaily=?,lastWork=?,lastBeg=?,lastRob=?,totalEarned=?,totalSpent=?,messageCount=? WHERE userId=?'
      ).run(mutable.balance, mutable.daily, mutable.lastDaily, mutable.lastWork, mutable.lastBeg, mutable.lastRob, mutable.totalEarned, mutable.totalSpent, mutable.messageCount, userId);
    });
  },
  close() { db.close(); }
};
