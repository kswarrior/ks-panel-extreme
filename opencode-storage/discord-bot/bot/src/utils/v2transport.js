// =============================================================================
//  KS Bot — Components V2 transport layer
//
//  Discord's Components V2 requires a *different message payload shape* than
//  legacy embeds:
//      { embeds: [EmbedBuilder...] }
//   -> { flags: MessageFlags.IsComponentsV2, components: [ContainerBuilder...] }
//
//  Most of the codebase (commands written before the V2 rewrite) still calls
//  `interaction.reply({ embeds: [successEmbed(...)] })`.  Rather than hand-
//  editing ~200 call sites, we wrap the send methods on the relevant Discord.js
//  prototypes once at startup.  When a payload's `embeds` array holds one or
//  more of our V2-marked `ContainerBuilder`s (see utils/embed.js -> V2_MARK),
//  the wrapper transparently flips the payload into the V2 shape.
//
//  Pure embeds (genuine `new EmbedBuilder()`) pass through untouched, so V2 and
//  legacy embeds can even coexist in one message.
// =============================================================================

const { MessageFlags, EmbedBuilder } = require("discord.js");
const { buildCard } = require("./embed");

const V2_MARK = "__ks_v2_container__";

function isV2Container(obj) {
  return obj != null && typeof obj === "object" && obj[V2_MARK] === true;
}

// Convert a legacy EmbedBuilder (discord.js) into a V2 ContainerBuilder.
// We preserve title, description, fields and thumbnail (if any). The accent color
// falls back to the embed's `color` property when present; otherwise the default
// neutral accent is used.  The resulting container is marked with V2_MARK so the
// transport treats it like any other V2 container.
function convertLegacyEmbed(embed) {
  if (!embed || typeof embed.toJSON !== "function") return null;
  const data = embed.toJSON(); // { title, description, color, fields, thumbnail, image, footer, ... }
  const fields = Array.isArray(data.fields) ? data.fields.map((f) => ({ name: f.name, value: f.value })) : [];
  const card = buildCard({
    title: data.title,
    description: data.description,
    theme: "neutral",
    thumbnail: data.thumbnail?.url,
    grid: fields.length > 0,
    perRow: 2,
    fields,
  });
  // If the legacy embed defined a custom color, use it as the accent.
  if (typeof data.color === "number" && typeof card.setAccentColor === "function") {
    card.setAccentColor(data.color);
  }
  return card;
}

// Rebuilds the options object: pulls V2 containers out of `embeds` and moves
// them into `components` (prefixing any existing components), then sets the
// IsComponentsV2 flag.  Returns the same options object (mutated) so caller
// chains still work.  Returns null if no V2 containers were found.
function upgradeOptions(options) {
  if (!options || typeof options !== "object") return null;

  const embeds = options.embeds;
  if (!Array.isArray(embeds) || !embeds.length) return null;

  // Separate V2 containers (our own) and legacy embeds (EmbedBuilder).
  const v2containers = embeds.filter(isV2Container);
  const legacyEmbeds = embeds.filter((e) => e instanceof EmbedBuilder);
  const converted = legacyEmbeds.map(convertLegacyEmbed).filter(Boolean);

  // Combine original V2 containers with converted containers.
  const allV2 = v2containers.concat(converted);
  if (!allV2.length) return null;

  // Anything that is neither a V2 container nor a legacy embed stays as a legacy embed.
  const remainingEmbeds = embeds.filter((e) => !isV2Container(e) && !(e instanceof EmbedBuilder));
  if (remainingEmbeds.length) options.embeds = remainingEmbeds;
  else delete options.embeds;

  const existingComponents = Array.isArray(options.components) ? options.components : [];
  // Prefix the V2 containers (original + converted) before any existing components.
  options.components = [...allV2, ...existingComponents];

  // Merge the V2 flag without clobbering any caller-provided flags (e.g. Ephemeral).
  // Also promote the legacy boolean `ephemeral` option into the flags bitfield
  // so it survives moving from `embeds:` to `components:` (otherwise discord.js
  // would do this promotion itself, but only when `embeds` is still present —
  // we want it for the V2 shape too).  Keep `ephemeral` set as well so callers
  // that read it later still work.
  let callerFlags = typeof options.flags === "number" ? options.flags : 0;
  if (options.ephemeral) callerFlags |= MessageFlags.Ephemeral;
  options.flags = callerFlags | MessageFlags.IsComponentsV2;

  return options;
}

// Wrap an instance/prototype method so its options arg is upgraded when V2.
function wrapMethod(target, methodName) {
  if (!target || typeof target[methodName] !== "function") return false;
  if (target[methodName].__ks_v2_patched) return false;

  const original = target[methodName];
  const wrapped = function (optionsOrContent, ...rest) {
    if (optionsOrContent && typeof optionsOrContent === "object" && !Array.isArray(optionsOrContent)) {
      const upgraded = upgradeOptions(optionsOrContent);
      if (upgraded) return original.call(this, upgraded, ...rest);
    }
    // content-first overload (e.g. channel.send('hi')) — leave untouched
    return original.call(this, optionsOrContent, ...rest);
  };
  wrapped.__ks_v2_patched = true;
  // Preserve any static helpers discord.js attaches (e.g. .createInteractionResponse)
  Object.keys(original).forEach((k) => { wrapped[k] = original[k]; });
  target[methodName] = wrapped;
  return true;
}

// Spec of <proto, [methodNames]> pairs to wrap. Only methods that actually
// exist on a given prototype are patched (wrapMethod is a no-op otherwise), so
// this list is portable across discord.js v14 sub-minors.
const SENDER_SPEC = [
  // The shared `update`/`deferUpdate` lives on MessageComponentInteraction (the
  // base of ButtonInteraction & SelectMenuInteraction). Wrapping that prototype
  // upgrades `.update({embeds:[legacyEmbed]})` calls into the V2 shape *and*
  // keeps the original message's IsComponentsV2 flag intact — without this, a
  // select-menu component that updates a help menu / poll / giveaway after the
  // message was sent as V2 throws "❌ An error occurred." because Discord
  // rejects mixing V2 + legacy embeds in the same message.
  ["MessageComponentInteraction", ["reply", "deferReply", "update", "deferUpdate", "editReply", "followUp"]],
  ["ModalSubmitInteraction",      ["reply", "update", "deferUpdate", "editReply", "followUp"]],
  ["ChatInputCommandInteraction", ["reply", "deferReply", "update", "editReply", "followUp"]],
  ["CommandInteraction",          ["reply", "deferReply", "editReply", "followUp"]],
  ["Message",                     ["reply", "edit"]],
  ["TextChannel",                 ["send", "edit"]],
  ["DMChannel",                   ["send"]],
  ["NewsChannel",                 ["send", "edit"]],
  ["User",                        ["send"]],
  ["GuildMember",                 ["send", "edit"]],
  ["MessageManager",              ["edit"]],
  ["Webhook",                     ["send", "edit"]],
  ["InteractionWebhook",          ["send", "edit"]],
  // followUp/edit on the InteractionResponse object (interaction.response.editReply, etc.).
  ["InteractionResponse",         ["edit", "fetch"]],
];

// Installs the translator onto all the prototypes the bot uses to send messages.
// Safe to call once at startup (idempotent — see __ks_v2_patched guard above).
function patchDiscordSenders(client) {
  const D = require("discord.js");
  for (const [className, methods] of SENDER_SPEC) {
    const Ctor = D[className];
    if (!Ctor || !Ctor.prototype) continue;
    for (const m of methods) wrapMethod(Ctor.prototype, m);
  }
  if (client) console.log("[V2] Modern Components V2 transport active for all message senders.");
}

module.exports = { patchDiscordSenders, upgradeOptions, isV2Container, V2_MARK };
