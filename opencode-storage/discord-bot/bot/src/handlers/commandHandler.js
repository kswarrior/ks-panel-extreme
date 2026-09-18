const { REST, Routes, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { getRestAgent: getFrontingRestAgent } = require("../utils/fronting");

function buildRestAgent() {
  // 1) External proxy if configured (PROXY_URL / PROXY_REST_URL).
  const proxyUrl = config.proxyUrl || config.proxyRestUrl;
  if (proxyUrl) {
    try {
      const { ProxyAgent } = require("undici");
      return new ProxyAgent(proxyUrl);
    } catch (e) {
      console.warn("[REST] ProxyAgent unavailable, using SNI fronting:", e.message);
    }
  }
  // 2) Otherwise -> SNI-fronting Agent (works with NO proxy env vars). This is
  //    what unblocks Discord on Hugging Face Spaces without needing a proxy.
  return getFrontingRestAgent();
}

function getRestAgent() {
  return buildRestAgent();
}

module.exports = {
  async loadCommands(client) {
    client.commands = new Collection();
    client.categories = new Collection();

    const commandFolders = fs.readdirSync(path.join(__dirname, "../commands"));
    const commandsData = [];

    for (const folder of commandFolders) {
      const commandFiles = fs
        .readdirSync(path.join(__dirname, "../commands", folder))
        .filter((file) => file.endsWith(".js"));

      const categoryCommands = [];

      for (const file of commandFiles) {
        const command = require(`../commands/${folder}/${file}`);
        if (!command.data || !command.execute) {
          console.warn(`[WARN] Command ${file} is missing data or execute property.`);
          continue;
        }

        client.commands.set(command.data.name, command);
        categoryCommands.push(command.data.name);
        commandsData.push(command.data.toJSON());

        if (command.buttonHandlers) {
          for (const [customId, handler] of Object.entries(command.buttonHandlers)) {
            client.buttonHandlers.set(customId, handler);
          }
        }

        if (command.selectMenuHandlers) {
          for (const [customId, handler] of Object.entries(command.selectMenuHandlers)) {
            client.selectMenuHandlers.set(customId, handler);
          }
        }

        if (command.modalHandlers) {
          if (!client.modalHandlers) client.modalHandlers = new Collection();
          for (const [customId, handler] of Object.entries(command.modalHandlers)) {
            client.modalHandlers.set(customId, handler);
          }
        }
      }

      client.categories.set(folder, categoryCommands);
    }

    return commandsData;
  },

  async registerCommands(commandsData) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      // Recreate REST each attempt: @discordjs/rest clears token on 401 (manager.setToken(null)),
      // so reusing same instance makes retries fail with "Expected token to be set".
      const rest = new REST({ version: "10", agent: getRestAgent() }).setToken(config.token);
      try {
        console.log(`[INFO] Registering commands (attempt ${attempt}/${maxRetries})...`);

        if (config.guildId) {
          await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
            body: commandsData,
          });
          console.log(`[OK] Registered ${commandsData.length} slash commands to guild ${config.guildId}`);
        } else {
          await rest.put(Routes.applicationCommands(config.clientId), {
            body: commandsData,
          });
          console.log(`[OK] Registered ${commandsData.length} global slash commands`);
        }
        return;
      } catch (error) {
        const status = error.status ?? error.code ?? "";
        const msg = error.message || String(error);
        const raw = error.rawError ? JSON.stringify(error.rawError).slice(0, 2000) : "";
        // 401 = invalid token - don't retry
        if (String(status) === "401" || msg.includes("401") || msg.includes("Unauthorized")) {
          console.error(`[ERROR] Command registration failed: 401 Unauthorized — invalid token.`);
          console.error(`[HINT] Get a new token at https://discord.com/developers/applications/${config.clientId}/bot → Reset Token, then update bot/.env TOKEN=... and restart.`);
          console.error(`[HINT] You can edit bot/.env via Manager → Files → .env → Edit → Save → Restart`);
          console.error("[ERROR] All registration attempts failed. Bot will continue without registered commands.");
          return;
        }
        // 400 Invalid Form Body = slash command validation error (e.g. required options after optional)
        if (String(status) === "400" || msg.includes("400") || msg.includes("Invalid Form Body") || msg.includes("APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID")) {
          console.error(`[ERROR] Command registration failed: Invalid Form Body (400).`);
          console.error(`[ERROR] Details: ${msg} ${raw}`);
          console.error(`[HINT] This is a slash command validation error: required options must be before optional options.`);
          console.error(`[HINT] Check the command that failed (see index in error, e.g. 56.options[1]) and fix its .add*Option order in bot/src/commands/`);
          console.error(`[HINT] Example fix: .addIntegerOption(required:true) must come before .addChannelOption(required:false)`);
          if (raw) console.error(`[RAW] ${raw}`);
          // Don't retry validation errors - they will never succeed
          console.error("[ERROR] All registration attempts failed. Bot will continue without registered commands.");
          return;
        }
        console.error(`[ERROR] Command registration attempt ${attempt} failed: ${msg} ${raw}`);
        if (attempt < maxRetries) {
          const delay = attempt * 5000;
          console.log(`[INFO] Retrying in ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.error("[ERROR] All registration attempts failed. Bot will continue without registered commands.");
          if (raw) console.error(`[RAW] ${raw}`);
        }
      }
    }
  },
};