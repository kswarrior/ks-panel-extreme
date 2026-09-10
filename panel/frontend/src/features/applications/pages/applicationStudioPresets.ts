// Curated starter presets the Application Studio offers on first open.
// Each preset is a self-contained ApplicationStudioDraft that the admin can
// edit further before installing. Mirrors modStudioPresets.ts: keeping the
// catalog in code (rather than the DB) means it ships with the panel,
// doesn't require a migration, and updates with each release.
//
// To add a preset: append a new entry to APPLICATION_STUDIO_PRESETS with a
// unique id, a human-readable label, a one-line description, an emoji icon,
// and a `build()` that returns an ApplicationStudioDraft.

import {
  blankApplicationStudioDraft,
  type ApplicationStudioDraft,
} from '@/features/applications/types/application';

// Discord bot (Node.js) — the most common application shape. Pre-fills a
// main file + env default + outbound-http capability so the admin sees the
// permissions + configure + script editors populated without starting blank.
const discordBot = (): ApplicationStudioDraft => ({
  ...blankApplicationStudioDraft(),
  name: 'Discord Bot',
  slug: 'discord-bot',
  category: 'discord',
  version: '1.0.0',
  description:
    'Node.js Discord bot starter. Runs src/bot.js with BOT_TOKEN from saved env. Requests outbound HTTP so it can reach the Discord gateway.',
  runtime: 'nodejs',
  mainFile: 'src/bot.js',
  permissionsRequested: [{ capability: 'outbound_http', access_level: 'standard' }],
  env: { BOT_TOKEN: '' },
  files: [
    {
      path: 'src/bot.js',
      content: `// Discord Bot — created by the Application Studio.\n// BOT_TOKEN comes from saved env (Configure tab), never hard-code it.\nconst token = process.env.BOT_TOKEN;\nif (!token) {\n  console.error('Missing BOT_TOKEN env');\n  process.exit(1);\n}\nconsole.log('Bot starting with token length ' + token.length);\n`,
    },
  ],
});

// Python service — same shape in Python, requesting filesystem read/write
// for a persistent data dir. Shows the script editor with a .py entrypoint.
const pythonService = (): ApplicationStudioDraft => ({
  ...blankApplicationStudioDraft(),
  name: 'Python Service',
  slug: 'python-service',
  category: 'custom',
  version: '1.0.0',
  description:
    'Python service starter. Runs app/main.py with filesystem read/write for a local data dir.',
  runtime: 'python',
  mainFile: 'app/main.py',
  permissionsRequested: [{ capability: 'filesystem', access_level: 'read_write' }],
  env: { DATA_DIR: './data' },
  files: [
    {
      path: 'app/main.py',
      content: `# Python Service — created by the Application Studio.\nimport os\n\ndata_dir = os.environ.get('DATA_DIR', './data')\nprint(f'Service starting, data dir: {data_dir}')\n`,
    },
  ],
});

// Bash tool — minimal single-file tool with no permissions requested, so the
// admin can install + activate immediately and learn the grant flow later.
const bashTool = (): ApplicationStudioDraft => ({
  ...blankApplicationStudioDraft(),
  name: 'Bash Tool',
  slug: 'bash-tool',
  category: 'custom',
  version: '1.0.0',
  description:
    'Minimal bash tool with no permissions requested — safe to activate immediately. Useful for learning the Studio install flow.',
  runtime: 'bash',
  mainFile: 'run.sh',
  permissionsRequested: [],
  files: [
    {
      path: 'run.sh',
      content: `#!/usr/bin/env bash\n# Bash Tool — created by the Application Studio.\nset -euo pipefail\necho "Hello from the Application Studio"\n`,
    },
  ],
});

// Capability sampler — requests every known capability at a safe level so
// the admin can exercise the grant / activate checklist without writing code.
// Mirrors the Mod Studio capability-sampler preset.
const capabilitySampler = (): ApplicationStudioDraft => ({
  ...blankApplicationStudioDraft(),
  name: 'Capability Sampler',
  slug: 'capability-sampler',
  version: '1.0.0',
  description:
    'No-code application that requests every available capability. Useful for exercising the grant / activate flow in the admin UI.',
  runtime: 'nodejs',
  mainFile: 'src/main.js',
  permissionsRequested: [
    { capability: 'network', access_level: 'connect' },
    { capability: 'filesystem', access_level: 'read_only' },
    { capability: 'outbound_http', access_level: 'standard' },
    { capability: 'process_control', access_level: 'spawn' },
  ],
  files: [
    {
      path: 'src/main.js',
      content: `// Capability Sampler — created by the Application Studio.\nconsole.log('Sampler running: approve my capabilities on the Applications page, then activate me.');\n`,
    },
  ],
});

export interface ApplicationStudioPreset {
  id: string;
  label: string;
  description: string;
  icon: string; // emoji, rendered in the picker card
  build: () => ApplicationStudioDraft;
}

export const APPLICATION_STUDIO_PRESETS: ApplicationStudioPreset[] = [
  {
    id: 'blank',
    label: 'Blank application',
    description: 'Start from scratch with minimal metadata + no permissions, files or env.',
    icon: '📄',
    build: blankApplicationStudioDraft,
  },
  {
    id: 'discord-bot',
    label: 'Discord Bot',
    description: 'Node.js bot starter with BOT_TOKEN env + outbound HTTP permission.',
    icon: '🤖',
    build: discordBot,
  },
  {
    id: 'python-service',
    label: 'Python Service',
    description: 'Python starter with a data-dir env default + filesystem permission.',
    icon: '🐍',
    build: pythonService,
  },
  {
    id: 'bash-tool',
    label: 'Bash Tool',
    description: 'Minimal single-file tool with no permissions — activates immediately.',
    icon: '🧰',
    build: bashTool,
  },
  {
    id: 'capability-sampler',
    label: 'Capability Sampler',
    description: 'Requests every capability — exercise the grant/activate UI.',
    icon: '🧪',
    build: capabilitySampler,
  },
];
