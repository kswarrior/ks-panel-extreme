const fs = require("fs");
const path = require("path");

module.exports = {
  async loadEvents(client) {
    const eventFiles = fs
      .readdirSync(path.join(__dirname, "../events"))
      .filter((file) => file.endsWith(".js"));

    for (const file of eventFiles) {
      const event = require(`../events/${file}`);

      if (typeof event.execute !== "function") {
        console.warn(`[WARN] Event ${file} missing execute function — skipping.`);
        continue;
      }

      const listener = (...args) => {
        try {
          event.execute(...args, client);
        } catch (error) {
          console.error(`[ERROR] Event "${event.name}" (${file}):`, error);
        }
      };

      if (event.once) {
        client.once(event.name, (arg) => listener(arg));
      } else {
        client.on(event.name, (arg) => listener(arg));
      }
    }

    console.log(`[EVT] Loaded ${eventFiles.length} event handler(s)`);
  },
};
