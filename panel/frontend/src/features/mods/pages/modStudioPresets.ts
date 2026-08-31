// Curated starter presets the Mod Studio offers on first open. Each preset
// is a self-contained ModStudioDraft that the admin can edit further before
// installing. Keeping the catalog in code (rather than the DB) means it ships
// with the panel, doesn't require a migration, and updates with each release.
//
// To add a preset: append a new entry to MOD_STUDIO_PRESETS with a unique id,
// a human-readable label, a one-line description, an emoji icon, and a
// `build()` that returns a ModStudioDraft. The Studio's "Start from preset"
// card grid renders these directly.

import { ModStudioDraft, blankModStudioDraft } from '@/shared/types/mod';

// minimal UI showcase — registers a slot, no backendScript, declares a
// single read-only capability. The admin sees the Studio's slot editor
// and permissions editor pre-populated without authoring from scratch.
const uiShowcase = (): ModStudioDraft => ({
  ...blankModStudioDraft(),
  name: 'UI Showcase',
  slug: 'ui-showcase',
  version: '1.0.0',
  description:
    'Registers a single UI slot in the instance detail header. Reads instance data through the read-only capability and renders a friendly banner — a safe starter template.',
  permissionsRequested: [{ capability: 'db.read_only', access_level: 'read_only' }],
  slots: [
    {
      name: 'instance.detail.header',
      component: 'Banner',
      props: { text: 'Hello from UI Showcase', tone: 'info' },
    },
  ],
});

// Terminal demo — declares terminal access, registers a hook that logs on
// instance start, and an inline backendScript that subscribes to the bus.
// Shows the Studio's backendScript + hooks editor pre-populated.
const terminalMonitor = (): ModStudioDraft => ({
  ...blankModStudioDraft(),
  name: 'Terminal Monitor',
  slug: 'terminal-monitor',
  version: '0.1.0',
  description:
    'Subscribes to instance.start / instance.stop events and writes a structured log entry through the terminal capability. Demonstrates the v2 hook + backendScript flow.',
  engineVersion: 2,
  permissionsRequested: [{ capability: 'terminal', access_level: 'read_write' }],
  hooks: [
    { event: 'instance.start', phase: 'post', handler: 'onInstanceStart' },
    { event: 'instance.stop', phase: 'post', handler: 'onInstanceStop' },
  ],
  backendScript: `// Terminal Monitor — registered by the Mod Studio.
// Runs inside the panel's Goja VM; logs every instance lifecycle
// event through ks.log and writes a counter to the mod's storage.
ks.events.on('instance.start', function (payload) {
  ks.log('info', 'instance.start fired for ' + (payload && payload.id));
  ks.storage.set('starts', String((Number(ks.storage.get('starts') || 0) + 1)));
});

ks.events.on('instance.stop', function (payload) {
  ks.log('info', 'instance.stop fired for ' + (payload && payload.id));
});

function onInstanceStart(payload) { ks.log('info', 'hook:start ' + (payload && payload.id)); }
function onInstanceStop(payload)  { ks.log('info', 'hook:stop '  + (payload && payload.id)); }
`,
});

// Permissions demo — a v1 manifest that requests a wide capability set so
// the admin can experiment with the grant/activate flow without writing any
// code. Useful as a "show me the capability pipeline" demo for new admins.
const capabilitySampler = (): ModStudioDraft => ({
  ...blankModStudioDraft(),
  name: 'Capability Sampler',
  slug: 'capability-sampler',
  version: '1.0.0',
  description:
    'No-code mod that requests every available capability at the lowest level. Useful for exercising the grant / activate flow in the admin UI.',
  permissionsRequested: [
    { capability: 'db.read_only',      access_level: 'read_only' },
    { capability: 'db.read_write',    access_level: 'read_write' },
    { capability: 'terminal',         access_level: 'read_only' },
    { capability: 'container.control',access_level: 'read_only' },
    { capability: 'vm.control',       access_level: 'read_only' },
    { capability: 'filesystem',       access_level: 'read_only' },
  ],
});

// Custom permission demo — declares two mod-scoped RBAC keys, plus a slot
// that uses one of them. Useful for testing the custom-permission UI.
const customPermsDemo = (): ModStudioDraft => ({
  ...blankModStudioDraft(),
  name: 'Custom Permissions Demo',
  slug: 'custom-perms-demo',
  version: '1.0.0',
  description:
    'Demonstrates mod-scoped RBAC keys: declares "audit" + "configure" and exposes them on a slot component. Use this to learn how the grant UI surfaces custom permissions.',
  engineVersion: 2,
  permissionsDeclared: [
    { key: 'audit',     description: 'Read the mod audit log' },
    { key: 'configure', description: 'Reconfigure the mod at runtime' },
  ],
  slots: [
    {
      name: 'instance.detail.header',
      component: 'CustomPermsBadge',
      props: { perms: ['audit', 'configure'] },
    },
  ],
});

export interface ModStudioPreset {
  id: string;
  label: string;
  description: string;
  icon: string; // emoji, rendered in the picker card
  build: () => ModStudioDraft;
}

export const MOD_STUDIO_PRESETS: ModStudioPreset[] = [
  {
    id: 'blank',
    label: 'Blank mod',
    description: 'Start from scratch with the minimal metadata + no permissions, slots or scripts.',
    icon: '📄',
    build: blankModStudioDraft,
  },
  {
    id: 'ui-showcase',
    label: 'UI Showcase',
    description: 'A no-code slot demo — registers a banner in the instance detail header.',
    icon: '🎨',
    build: uiShowcase,
  },
  {
    id: 'terminal-monitor',
    label: 'Terminal Monitor',
    description: 'v2 mod with a backendScript + lifecycle hooks. Logs every instance start/stop.',
    icon: '🛰️',
    build: terminalMonitor,
  },
  {
    id: 'capability-sampler',
    label: 'Capability Sampler',
    description: 'Requests every capability at the lowest level — exercise the grant/activate UI.',
    icon: '🧪',
    build: capabilitySampler,
  },
  {
    id: 'custom-perms-demo',
    label: 'Custom Permissions',
    description: 'Declares two mod-scoped RBAC keys + a slot that exposes them.',
    icon: '🔑',
    build: customPermsDemo,
  },
];
