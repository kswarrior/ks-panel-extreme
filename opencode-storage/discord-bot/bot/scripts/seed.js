// scripts/seed.js
// Initializes all SQLite database tables used by KS Bot.
// Run with: npm run seed
// Safe to run repeatedly (uses CREATE TABLE IF NOT EXISTS).

const path = require('path');
const fs = require('fs');

// Reuse the same resolver the app uses (prefers /data on HF Spaces, else repo dir)
const { DB_DIR } = require('../src/utils/database');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

console.log('[SEED] Initializing database tables...\n');

// 1) Economy database
const economyDB = require('../src/utils/database/economy');
console.log('  [OK] economy.db -> users, inventory, badges');

// 2) Warnings database (auto-creates its table on require)
require('../src/utils/database/warnings');
console.log('  [OK] warnings.db -> warnings');

// 3) Leveling database (auto-creates its table on require)
require('../src/utils/database/leveling');
console.log('  [OK] levels.db -> user_levels');

// 4) Guild config database (auto-creates its table on require)
require('../src/utils/database/guildconfig');
console.log('  [OK] guildconfig.db -> guild_config');

// 5) Generic database wrapper is exercised so the 'bot.db' file is created too
require('../src/utils/database').get('bot');
console.log('  [OK] bot.db -> ready');

console.log('\n[SEED] All tables created successfully.');
console.log('[SEED] You can now run: npm start');
