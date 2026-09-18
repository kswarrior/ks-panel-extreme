const { errorEmbed } = require("../utils/embed");
const config = require("../config");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
        } catch (error) {
          console.error(`[ERROR] Command ${interaction.commandName}:`, error);
          const embed = errorEmbed("Command Error", `❌ An error occurred while executing this command.\n\`${error.message}\``);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
          } else {
            await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
          }
        }
    }

    if (interaction.isButton()) {
      const exact = client.buttonHandlers?.get(interaction.customId);
      if (exact) {
        try {
          await exact(interaction, client);
        } catch (error) {
          console.error(`[ERROR] Button ${interaction.customId}:`, error);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
          } else {
            await interaction.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
          }
        }
        return;
      }

      for (const [prefix, handler] of client.buttonHandlers?.entries() || []) {
        if (interaction.customId.startsWith(prefix)) {
          try {
            await handler(interaction, client);
          } catch (error) {
            console.error(`[ERROR] Button ${interaction.customId} (prefix:${prefix}):`, error);
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
            } else {
              await interaction.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
            }
          }
          return;
        }
      }
    }

    if (interaction.isStringSelectMenu()) {
      const exact = client.selectMenuHandlers?.get(interaction.customId);
      if (exact) {
        try {
          await exact(interaction, client);
        } catch (error) {
          console.error(`[ERROR] Select menu ${interaction.customId}:`, error);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
          } else {
            await interaction.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
          }
        }
        return;
      }

      for (const [prefix, handler] of client.selectMenuHandlers?.entries() || []) {
        if (interaction.customId.startsWith(prefix)) {
          try {
            await handler(interaction, client);
          } catch (error) {
            console.error(`[ERROR] Select menu ${interaction.customId} (prefix:${prefix}):`, error);
          }
          return;
        }
      }
    }

    if (interaction.isModalSubmit()) {
      if (!client.modalHandlers) return;

      const exact = client.modalHandlers.get(interaction.customId);
      if (exact) {
        try {
          await exact(interaction, client);
        } catch (error) {
          console.error(`[ERROR] Modal ${interaction.customId}:`, error);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
          } else {
            await interaction.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
          }
        }
        return;
      }

      for (const [prefix, handler] of client.modalHandlers.entries()) {
        if (interaction.customId.startsWith(prefix)) {
          try {
            await handler(interaction, client);
          } catch (error) {
            console.error(`[ERROR] Modal ${interaction.customId} (prefix:${prefix}):`, error);
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
            } else {
              await interaction.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
            }
          }
          return;
        }
      }
    }
  },
};
