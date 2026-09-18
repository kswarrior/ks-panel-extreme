// =============================================================================
//  KS Bot — Modern message UI built on Discord Components V2
//
//  Helpers return a V2 `ContainerBuilder` styled as a modern "card":
//
//    ╭─ accent color bar ────────────────────────────────────╮
//    │ [thumb]  ## ✅ Title                                   │
//    │         Body description text...                       │
//    │  ───────────────────────────────────────────────────  │
//    │  section / fields / KV pairs...                        │
//    │  ───────────────────────────────────────────────────  │
//    │  _KS Bot • Made by KS Warrior_                         │
//    ╰────────────────────────────────────────────────────────╯
//
//  Callers pass it exactly like the old EmbedBuilder — `interaction.reply`
//  with `{ embeds: [helper(...)] }` is auto-translated to `flags:IsComponentsV2
//  + components:[...]` by src/utils/v2transport.js (wired in index.js), so the
//  ~30 importing command files auto-upgrade with zero per-file changes.
// =============================================================================

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
} = require("discord.js");
const config = require("../config");

// Per-type visual identity. `color` runs down the LEFT accent edge; `emoji`
// leads the bold header.
const THEME = {
  success: { color: config.colors.success, emoji: config.emojis.success },
  error:   { color: config.colors.error,   emoji: config.emojis.error },
  warning: { color: config.colors.warning,  emoji: config.emojis.warning },
  info:    { color: config.colors.info,     emoji: config.emojis.info },
  mod:     { color: config.colors.primary,  emoji: config.emojis.mod },
  neutral: { color: config.colors.embed,    emoji: config.emojis.info },
  fun:     { color: config.colors.primary,  emoji: config.emojis.fun },
  economy: { color: config.colors.warning,  emoji: "💰" },
};

const FOOTER = `-# ${config.botName} • Made by ${config.ownerName}`;
const S = 1; // small spacing around dividers (1 = small)

// Tag the container so v2transport recognises it even when packed into a legacy
// `embeds:\[\]` payload.
const V2_MARK = "__ks_v2_container__";
const markV2 = (c) => { c[V2_MARK] = true; return c; };

// Render a markdown "field row" — used for the info layouts
// (userinfo/botinfo/balance). Each kv pair becomes a single line:
//
//   **Name:** value
//   **Name:** value
//
// Long/multi-line values (e.g. a roles list) are placed on the line after
// their bold key so they don't collide with the next label. This keeps
// Discord rendering compact (no blank-line gaps and no heavy ### headings).
function renderFields(fields) {
  if (!fields || !fields.length) return null;
  return fields
    .map((f) => {
      if (f && typeof f === "string") return f;
      if (!f || !f.name) return "";
      const val = f.value == null ? "" : String(f.value);
      if (val === "") return `**${f.name}:** —`;
      // Multi-line / long value -> key on its own line, value beneath it.
      if (val.includes("\n") || val.length > 60) return `**${f.name}:**\n${val}`;
      // Short value -> "key: value" on a single line.
      return `**${f.name}:** ${val}`;
    })
    .join("\n");
}

// Renders an aligned 2-column grid of label/value using a fixed-width style.
// Discord markdown doesn't have tables, so we use code blocks for alignment.
function renderGrid(fields, perRow = 3) {
  if (!fields || !fields.length) return null;
  const rows = [];
  for (let i = 0; i < fields.length; i += perRow) {
    rows.push(fields.slice(i, i + perRow));
  }
  const lines = [];
  for (const row of rows) {
    const names = row.map((f) => `**${f.name}**`).join("  •  ");
    const values = row.map((f) => `\`${f.value == null ? "—" : f.value}\``).join("  •  ");
    lines.push(names, values, "");
  }
  return lines.join("\n").trimEnd();
}

// Build the header. When a thumbnail/button accessory is available, we use a
// `SectionBuilder` (Cards V2 require every Section to carry an accessory);
// otherwise we emit a plain `TextDisplayBuilder` for the header.
function headerBlock(title, description, themeKey, thumbnailURL, buttonAccessory) {
  const theme = THEME[themeKey] || THEME.neutral;
  const head = title != null && String(title).length
    ? `## ${theme.emoji}  ${title}`
    : `## ${theme.emoji}`;
  const content = [head];
  if (description) content.push("", String(description));
  const td = new TextDisplayBuilder().setContent(content.join("\n"));

  if (thumbnailURL || buttonAccessory) {
    const section = new SectionBuilder().addTextDisplayComponents(td);
    try {
      if (thumbnailURL) section.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: thumbnailURL } }));
      else if (buttonAccessory) section.setButtonAccessory(buttonAccessory);
    } catch { /* fall back to plain text below */ return td; }
    return section;
  }
  return td;
}

// Core builder: theme card with optional thumbnail, fields and extra sections.
function buildContainer(title, description, themeKey, opts = {}) {
  const theme = THEME[themeKey] || THEME.neutral;
  const { thumbnail, button, fields, grid, perRow, sections = [], spoiler = false } = opts;

  const container = new ContainerBuilder().setAccentColor(theme.color);
  if (spoiler) container.setSpoiler(true);

  // 1) Header (Section if there's a thumbnail/button accessory, else plain Text)
  const head = headerBlock(title, description, themeKey, thumbnail, button);
  if (head instanceof SectionBuilder) container.addSectionComponents(head);
  else container.addTextDisplayComponents(head);

  // 2) Optional grid/fields block as its own TextDisplay
  const fieldText = grid
    ? renderGrid(fields, perRow)
    : renderFields(fields);
  if (fieldText) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(S));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldText));
  }

  // 3) Extra supplied text blocks, each separated
  for (const block of sections) {
    if (block == null) continue;
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(S));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(block)));
  }

  // 4) Footer
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(S));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(FOOTER));

  return markV2(container);
}

// --- Public helpers (same signatures as the legacy embed helpers) ----------
// All return a V2 ContainerBuilder.

function createEmbed(title, description, _color) { return buildContainer(title, description, "neutral"); }
function successEmbed(title, description)        { return buildContainer(title, description, "success"); }
function errorEmbed(title, description)          { return buildContainer(title, description, "error"); }
function warnEmbed(title, description)          { return buildContainer(title, description, "warning"); }
function infoEmbed(title, description)           { return buildContainer(title, description, "info"); }
function modEmbed(title, description)            { return buildContainer(title, description, "mod"); }
function funEmbed(title, description)            { return buildContainer(title, description, "fun"); }
function economyEmbed(title, description)        { return buildContainer(title, description, "economy"); }

// --- Advanced modern helpers for new/refactored commands --------------------

// Full-featured card builder.
//   buildCard({
//     title, description, theme,
//     thumbnail: 'https://...',      // header thumbnail accessory
//     fields: [{name,value}],       // rendered as ### `name`\nvalue
//     grid: true, perRow: 3,        // render fields as aligned columns
//     sections: ["block1", "block2"], // extra separated text blocks
//     spoiler: false,
//   })
function buildCard(opts = {}) {
  return buildContainer(opts.title, opts.description, opts.theme || "neutral", opts);
}

// Append more text blocks to an existing container (separated).
function addSection(container, ...textBlocks) {
  if (!container || !container.addTextDisplayComponents) return container;
  const blocks = textBlocks.filter((b) => b != null && String(b).length);
  if (!blocks.length) return container;
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(S));
  for (const block of blocks) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(block)));
  }
  return container;
}

module.exports = {
  createEmbed, successEmbed, errorEmbed, warnEmbed, infoEmbed, modEmbed,
  funEmbed, economyEmbed,
  buildCard, addSection,
  renderFields, renderGrid,
  V2_MARK, THEME, FOOTER,
};
