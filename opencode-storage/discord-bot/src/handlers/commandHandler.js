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
    const rest = new REST({ version: "10", agent: getRestAgent() }).setToken(config.token);
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
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
        console.error(`[ERROR] Command registration attempt ${attempt} failed: ${error.message}`);
        if (attempt < maxRetries) {
          const delay = attempt * 5000;
          console.log(`[INFO] Retrying in ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.error("[ERROR] All registration attempts failed. Bot will continue without registered commands.");
        }
      }
    }
  },
};