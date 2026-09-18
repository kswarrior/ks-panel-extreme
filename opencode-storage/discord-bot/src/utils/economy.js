const config = require("../config");
const economyDB = require("./database/economy");

const UNLIMITED_BALANCE = 999999999999;

function isOwner(userId) { return userId === config.ownerId; }

function fetchInventory(userId) {
  // No longer used directly - inventory is included in getUser/getAllUsers
  return [];
}

function fetchBadges(userId) {
  return [];
}

function getUser(userId) { return economyDB.getUser(userId); }

function getOrCreateUser(userId) { return economyDB.getOrCreateUser(userId); }

function addBalance(userId, amount) { return economyDB.addBalance(userId, amount); }

function removeBalance(userId, amount) {
  if (isOwner(userId)) return UNLIMITED_BALANCE;
  return economyDB.removeBalance(userId, amount);
}

function setBalance(userId, amount) { return economyDB.setBalance(userId, amount); }

function addItem(userId, itemId, quantity = 1) { economyDB.addItem(userId, itemId, quantity); }

function removeItem(userId, itemId, quantity = 1) { return economyDB.removeItem(userId, itemId, quantity); }

function hasItem(userId, itemId) { return economyDB.hasItem(userId, itemId); }

function addBadge(userId, badgeId) { economyDB.addBadge(userId, badgeId); }

const VALID_FIELDS = new Set([
  "lastDaily","lastWork","lastBeg","lastRob","daily","balance",
  "totalEarned","totalSpent","messageCount",
]);

function setCooldown(userId, field, value) {
  if (!VALID_FIELDS.has(field)) throw new Error(`Invalid field '${field}'`);
  getOrCreateUser(userId);
  economyDB.setCooldown(userId, field, value);
}

function getAllUsers() { return economyDB.getAllUsers(); }

function updateUser(userId, updater) { return economyDB.updateUser(userId, updater); }

module.exports = {
  getUser, getOrCreateUser, addBalance, removeBalance, setBalance,
  addItem, removeItem, hasItem, addBadge, setCooldown, getAllUsers, updateUser, isOwner,
};
