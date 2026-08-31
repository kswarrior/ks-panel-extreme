# Instance Pages System — Full Functional Design

## Overview

Instance Pages are **runtime-loadable modules** that provide fully functional UI pages inside the **instance panel** (not the admin panel). They run in the instance context with scoped permissions, similar to how mods extend the admin panel but restricted to instance-scoped capabilities.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INSTANCE PANEL (Frontend)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Instance Page Registry                            │   │
│  │  • Discovers page modules from marketplace/local/registry           │   │
│  │  • Validates permissions against instance spec                      │   │
│  │  • Dynamic imports page components via import()                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                    ┌─────────────────┼─────────────────┐                  │
│                    ▼                 ▼                 ▼                  │
│           ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│           │  Built-in   │    │  Custom     │    │  Module     │          │
│           │  (React)    │    │  (HTML/MD/  │    │  Page (.kspm│          │
│           │  Terminal   │    │   Blocks)   │    │   bundle)   │          │
│           │  Files      │    │             │    │             │          │
│           │  Metrics    │    │ CustomPageView│  │ Dynamic     │          │
│           └─────────────┘    └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
           │  Instance    │  │   Edge       │  │   Panel      │
           │  Context     │  │   RPC        │  │   APIs       │
           │  (instanceId,│  │  (page-action│  │  (REST)      │
           │   config,    │  │   execute)   │  │              │
           │   secrets)   │  │              │  │              │
           └──────────────┘  └──────────────┘  └──────────────┘
```

---

## Page Module Format (.kspm)

A page module is a **ZIP bundle** (`.kspm` extension) containing:

```
page-module.kspm
├── manifest.json          # Required: metadata, permissions, entry point
├── page.js                # Required: compiled React component (UMD/ESM)
├── page.css               # Optional: styles
├── assets/                # Optional: images, fonts, wasm
│   └── ...
└── LICENSE                # Optional
```

### manifest.json Schema

```json
{
  "$schema": "https://kspanel.io/schemas/instance-page-module-v1.json",
  "id": "terminal-pro",
  "name": "Terminal Pro",
  "version": "1.2.0",
  "description": "Enhanced terminal with tabs, search, and session recording",
  "author": "KS Panel Team",
  "license": "MIT",
  "homepage": "https://github.com/kspanel/terminal-pro",
  "repository": "https://github.com/kspanel/terminal-pro",
  
  "slug": "terminal",
  "kind": "module",
  "category": "terminal",
  
  "entry": "page.js",
  "exports": {
    "default": "./page.js",
    "./styles.css": "./page.css"
  },
  
  "permissions": {
    "instance": [
      "terminal:read",
      "terminal:write", 
      "terminal:resize",
      "terminal:record"
    ],
    "edge": [
      "exec:shell",
      "exec:pty",
      "file:read",
      "file:write"
    ],
    "panel": [
      "api:instances:read",
      "api:instances:write"
    ]
  },
  
  "capabilities": {
    "websockets": true,
    "pty": true,
    "fileAccess": true,
    "processExec": true,
    "persistentStorage": "50MB"
  },
  
  "instanceConstraints": {
    "minPanelVersion": "0.1.0",
    "maxPanelVersion": "*",
    "requiredKinds": ["docker", "kvm", "lxd"],
    "excludedKinds": [],
    "minMemoryMiB": 64,
    "requiresNetwork": true
  },
  
  "ui": {
    "icon": "terminal",
    "iconSvg": "<path d=\"M4 17l7-7-7-7...\" />",
    "previewImage": "assets/preview.png",
    "tags": ["terminal", "ssh", "cli", "developer-tools"],
    "documentationUrl": "https://docs.kspanel.io/pages/terminal-pro"
  },
  
  "configuration": {
    "schema": {
      "type": "object",
      "properties": {
        "shell": { "type": "string", "default": "bash", "enum": ["bash", "zsh", "fish", "sh"] },
        "fontSize": { "type": "number", "default": 14, "minimum": 10, "maximum": 24 },
        "theme": { "type": "string", "default": "dark", "enum": ["dark", "light", "solarized"] },
        "scrollback": { "type": "number", "default": 10000, "minimum": 1000 },
        "bell": { "type": "boolean", "default": true },
        "cursorBlink": { "type": "boolean", "default": true }
      }
    },
    "defaults": {
      "shell": "bash",
      "fontSize": 14,
      "theme": "dark",
      "scrollback": 10000,
      "bell": true,
      "cursorBlink": true
    }
  },
  
  "dependencies": {
    "peer": {
      "react": ">=18.0.0",
      "react-dom": ">=18.0.0",
      "@kspanel/page-runtime": ">=1.0.0"
    },
    "bundled": [
      "xterm@5.3.0",
      "xterm-addon-fit@0.8.0",
      "xterm-addon-web-links@0.9.0"
    ]
  }
}
```

---

## Page Runtime API

Pages receive a **context object** via React Context or props:

```typescript
interface InstancePageContext {
  // Instance identity
  instance: {
    id: number;
    name: string;
    displayName: string;
    kind: string;
    status: string;
    nodeId: number;
    nodeName: string;
    templateId: number;
    templateName: string;
    config: Record<string, any>;  // Deploy-time spec snapshot
    secrets: Record<string, string>;  // Only if permission granted
    externalId: string;
  };
  
  // Scoped API clients
  api: {
    instance: InstanceApi;    // REST: /api/instances/:id/*
    edge: EdgeRpcClient;      // RPC: page-action, file, exec
    panel: PanelApiClient;    // REST: /api/* (panel-wide, limited)
  };
  
  // Real-time connections
  sockets: {
    terminal: TerminalSocket;  // WebSocket for PTY
    metrics: MetricsSocket;    // WebSocket for live metrics
    logs: LogSocket;           // WebSocket for log streaming
    events: EventSocket;       // WebSocket for instance events
  };
  
  // Permissions (validated at load time)
  permissions: {
    instance: string[];  // e.g., ["terminal:read", "terminal:write"]
    edge: string[];      // e.g., ["exec:shell", "file:read"]
    panel: string[];     // e.g., ["api:instances:read"]
  };
  
  // Configuration (from template spec + user overrides)
  config: Record<string, any>;
  
  // Utilities
  utils: {
    notify: (msg: string, type: 'info' | 'success' | 'warning' | 'error') => void;
    confirm: (msg: string) => Promise<boolean>;
    prompt: (msg: string, defaultValue?: string) => Promise<string | null>;
    download: (blob: Blob, filename: string) => void;
    upload: (accept?: string) => Promise<File | null>;
    clipboard: { read: () => Promise<string>; write: (text: string) => Promise<void> };
  };
  
  // Theme
  theme: Theme;
  
  // Lifecycle
  onMount: () => void | (() => void);  // Return cleanup function
  onUnmount: () => void;
}
```

### Edge RPC Client (for page-action execution)

```typescript
interface EdgeRpcClient {
  // Execute a page action (shell, file, docker, etc.)
  executeAction(action: PageAction): Promise<ActionResult>;
  
  // Terminal/PTY
  pty: {
    spawn: (cols: number, rows: number, shell?: string) => Promise<PtySession>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    write: (sessionId: string, data: string) => Promise<void>;
    close: (sessionId: string) => Promise<void>;
  };
  
  // File operations
  files: {
    list: (path: string) Promise<FileEntry[]>;
    read: (path: string) Promise<string>;
    write: (path: string, content: string, mode?: number) Promise<void>;
    delete: (path: string) Promise<void>;
    mkdir: (path: string, recursive?: boolean) Promise<void>;
    stat: (path: string) Promise<FileStat>;
    download: (path: string) Promise<Blob>;
    upload: (path: string, file: File) Promise<void>;
  };
  
  // Process management
  processes: {
    list: () Promise<ProcessInfo[]>;
    kill: (pid: number, signal?: number) Promise<void>;
    exec: (cmd: string, args?: string[], env?: Record<string, string>) Promise<ExecResult>;
  };
  
  // Docker
  docker: {
    ps: (all?: boolean) Promise<DockerContainer[]>;
    inspect: (id: string) Promise<DockerContainer>;
    logs: (id: string, opts?: LogOptions) Promise<AsyncIterable<string>>;
    exec: (id: string, cmd: string[]) Promise<ExecResult>;
    start: (id: string) Promise<void>;
    stop: (id: string, timeout?: number) Promise<void>;
    restart: (id: string) Promise<void>;
  };
}
```

---

## Permission System

### Permission Categories

| Category | Prefix | Examples |
|----------|--------|----------|
| Instance | `instance:*` | `instance:terminal:read`, `instance:files:write` |
| Edge RPC | `edge:*` | `edge:exec:shell`, `edge:file:read`, `edge:docker:ps` |
| Panel API | `panel:*` | `panel:api:instances:read`, `panel:api:templates:read` |

### Permission Validation Flow

```
1. Page module declares required permissions in manifest.json
2. Admin imports page → stored in instance_pages table
3. Admin links page to template → added to template.spec.pages
4. Instance deployed → template.spec.pages copied to instance.config
5. User visits instance page:
   a. Frontend loads page module manifest
   b. Checks: does instance.config.pages[slug].enabled === true?
   c. Checks: does user role have ALL required permissions?
   d. If yes → dynamic import page.js → render with context
   e. If no → show "Insufficient permissions" card
```

### Template Spec Integration

```json
{
  "pages": [
    {
      "slug": "terminal-pro",
      "kind": "module",
      "moduleId": "terminal-pro@1.2.0",
      "label": "Terminal Pro",
      "iconSvg": "<path.../>",
      "enabled": true,
      "config": {
        "shell": "zsh",
        "fontSize": 14,
        "theme": "solarized"
      },
      "permissions": {
        "instance": ["terminal:read", "terminal:write", "terminal:record"],
        "edge": ["exec:shell", "exec:pty"]
      }
    }
  ]
}
```

---

## Module Registry & Discovery

### Sources

1. **Local Registry** - `instance_pages/modules/` directory on panel host
2. **Marketplace** - Remote catalog (marketplace.json with download URLs)
3. **Upload** - Admin uploads .kspm file via UI
4. **Git** - Install from git repo (future)

### Registry API

```typescript
interface PageModuleRegistry {
  // List all available modules
  list(): Promise<PageModuleManifest[]>;
  
  // Get module by ID (with version resolution)
  get(moduleId: string, version?: string): Promise<PageModuleManifest>;
  
  // Download and install module
  install(moduleId: string, version?: string): Promise<InstalledModule>;
  
  // Uninstall module
  uninstall(moduleId: string): Promise<void>;
  
  // Get installed modules
  getInstalled(): Promise<InstalledModule[]>;
  
  // Check for updates
  checkUpdates(): Promise<ModuleUpdate[]>;
}

interface InstalledModule {
  manifest: PageModuleManifest;
  path: string;           // Local filesystem path
  installedAt: Date;
  installedBy: number;    // User ID
}
```

### Module Loading (Frontend)

```typescript
// InstancePageRegistry.ts
class InstancePageRegistry {
  private modules = new Map<string, InstalledPageModule>();
  
  async loadModule(moduleId: string, version: string): Promise<React.ComponentType> {
    const installed = await this.getInstalled(moduleId, version);
    if (!installed) throw new Error(`Module not installed: ${moduleId}@${version}`);
    
    // Dynamic import with cache
    const cacheKey = `${moduleId}@${version}`;
    if (this.modules.has(cacheKey)) {
      return this.modules.get(cacheKey)!;
    }
    
    // Load via import() - Vite/Rollup handles code splitting
    const module = await import(
      `/api/instance-page-modules/${moduleId}/${version}/page.js`
    );
    
    const Component = module.default || module;
    this.modules.set(cacheKey, Component);
    return Component;
  }
  
  // In InstanceDynamicPage:
  async renderPage(slug: string, spec: PageSpec, context: InstancePageContext) {
    if (spec.kind === 'module') {
      const Component = await this.loadModule(spec.moduleId, spec.version);
      return <Component context={context} config={spec.config} />;
    }
    // ... builtin, custom handling
  }
}
```

---

## Backend API Endpoints

### Module Management

```
GET    /api/instance-page-modules/              # List available (marketplace + local)
GET    /api/instance-page-modules/:id/:version  # Get module manifest
POST   /api/instance-page-modules/upload        # Upload .kspm file
POST   /api/instance-page-modules/install       # Install from marketplace
DELETE /api/instance-page-modules/:id/:version  # Uninstall
GET    /api/instance-page-modules/:id/:version/page.js     # Serve page bundle
GET    /api/instance-page-modules/:id/:version/page.css    # Serve styles
GET    /api/instance-page-modules/:id/:version/assets/*    # Serve assets
```

### Instance Page Runtime (Edge)

```
POST   /api/edge/page-module/:instanceId/:moduleId/action   # Execute module action
WS     /api/edge/page-module/:instanceId/:moduleId/pty      # PTY WebSocket
WS     /api/edge/page-module/:instanceId/:moduleId/metrics  # Metrics WebSocket
WS     /api/edge/page-module/:instanceId/:moduleId/logs     # Logs WebSocket
```

---

## Instance Page Types Comparison

| Feature | Built-in (React) | Custom (HTML/MD/Blocks) | Module (.kspm) |
|---------|------------------|------------------------|----------------|
| **Interactivity** | Full (WebSocket, PTY) | None (static) | Full (WebSocket, PTY) |
| **File Access** | Via edge RPC | No | Via edge RPC (scoped) |
| **Process Exec** | Via edge RPC | No | Via edge RPC (scoped) |
| **Docker/KVM** | Via edge RPC | No | Via edge RPC (scoped) |
| **Real-time Data** | Yes | No | Yes |
| **Persistence** | Instance config | Instance config | Instance config + module storage |
| **Versioning** | Panel version | N/A | Semantic versioning |
| **Updates** | Panel update | Re-import | Module update |
| **Distribution** | Built-in | JSON file | .kspm bundle |
| **Development** | Panel repo | Studio/JSON | Independent repo |
| **Isolation** | Shared bundle | Sandboxed iframe | Sandboxed (optional) |

---

## Module Development Workflow

### 1. Scaffold

```bash
npx create-kspanel-page-module my-terminal-page
# Creates:
# my-terminal-page/
#   ├── package.json
#   ├── tsconfig.json
#   ├── vite.config.ts
#   ├── src/
#   │   ├── Page.tsx
#   │   ├── index.ts
#   │   └── styles.css
#   ├── manifest.json
#   └── README.md
```

### 2. Develop

```typescript
// src/Page.tsx
import { useInstancePageContext } from '@kspanel/page-runtime';
import { Terminal } from '@kspanel/components/terminal';

export default function MyTerminalPage() {
  const { instance, api, sockets, permissions, config } = useInstancePageContext();
  
  // Check permission at runtime
  if (!permissions.edge.includes('exec:pty')) {
    return <PermissionDenied permission="exec:pty" />;
  }
  
  return (
    <Terminal
      instanceId={instance.id}
      shell={config.shell}
      fontSize={config.fontSize}
      theme={config.theme}
      onExecute={api.edge.pty.spawn}
    />
  );
}
```

### 3. Build

```bash
npm run build
# Outputs:
# dist/
#   ├── page.js        (UMD/ESM bundle)
#   ├── page.css
#   └── manifest.json  (copied)
```

### 4. Package

```bash
npx kspanel-page-module pack
# Creates: my-terminal-page-1.0.0.kspm
```

### 5. Publish

- Upload to marketplace
- Or host privately
- Admin imports via UI

---

## Security Model

### Sandbox Options

| Level | Description | Use Case |
|-------|-------------|----------|
| **None** | Direct React component, full context access | Trusted built-in pages |
| **Iframe** | Rendered in sandboxed iframe, postMessage API | Untrusted third-party |
| **Worker** | Runs in WebWorker, limited DOM | Heavy computation |
| **VM** | Isolated VM (if using QuickJS/WASM) | Maximum isolation |

### Permission Enforcement

1. **Manifest declaration** - Module declares what it needs
2. **Install-time review** - Admin sees permissions before install
3. **Link-time validation** - Template linking checks role permissions
4. **Runtime guards** - API clients throw if permission missing
5. **Edge enforcement** - Edge validates every RPC call

### Content Security Policy

```html
<!-- For iframe-sandboxed pages -->
<iframe 
  src="..." 
  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
  csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src wss: https:;"
/>
```

---

## Marketplace Format

### Catalog (marketplace.json)

```json
{
  "version": "2.0",
  "updated": "2026-08-20",
  "categories": [
    { "id": "terminal", "label": "Terminal", "icon": "terminal" },
    { "id": "files", "label": "File Manager", "icon": "file" },
    { "id": "monitoring", "label": "Monitoring", "icon": "activity" },
    { "id": "database", "label": "Database", "icon": "database" },
    { "id": "security", "label": "Security", "icon": "shield" },
    { "id": "developer", "label": "Developer Tools", "icon": "code" }
  ],
  "modules": [
    {
      "id": "terminal-pro",
      "name": "Terminal Pro",
      "latestVersion": "1.2.0",
      "description": "Enhanced terminal with tabs, search, recording",
      "category": "terminal",
      "author": "KS Panel Team",
      "license": "MIT",
      "iconSvg": "...",
      "previewImages": ["https://.../preview1.png"],
      "tags": ["terminal", "ssh", "tabs", "recording"],
      "versions": [
        {
          "version": "1.2.0",
          "downloadUrl": "https://marketplace.kspanel.io/modules/terminal-pro/1.2.0/terminal-pro-1.2.0.kspm",
          "sha256": "abc123...",
          "changelog": "Added session recording",
          "minPanelVersion": "0.1.0",
          "publishedAt": "2026-08-15"
        }
      ]
    }
  ]
}
```

---

## Migration Path

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Page module manifest schema & validation
- [ ] Module registry (local + marketplace)
- [ ] Upload/install/uninstall API
- [ ] Module storage on disk

### Phase 2: Runtime Loading (Week 2-3)
- [ ] Frontend dynamic import system
- [ ] InstancePageContext provider
- [ ] Permission validation at load time
- [ ] Integration with InstanceDynamicPage

### Phase 3: Edge RPC (Week 3-4)
- [ ] Edge page-module endpoint
- [ ] PTY WebSocket for terminal modules
- [ ] File/Process/Docker RPC for modules
- [ ] Permission enforcement on edge

### Phase 4: Developer Experience (Week 4-5)
- [ ] `create-kspanel-page-module` scaffold
- [ ] `@kspanel/page-runtime` npm package
- [ ] Build tooling (Vite config)
- [ ] Packaging CLI

### Phase 5: Polish (Week 5-6)
- [ ] Marketplace UI in InstancePages page
- [ ] Module update notifications
- [ ] Configuration UI in TemplateForm
- [ ] Documentation & examples

---

## Configuration Files

### panel/backend/internal/config/instance_pages.go

```go
type InstancePageModuleConfig struct {
  // Module storage
  ModulesDir string `json:"modules_dir"`  // default: "instance_pages/modules"
  
  // Marketplace
  MarketplaceURL string `json:"marketplace_url"`  // default: "https://marketplace.kspanel.io"
  MarketplaceCacheTTL time.Duration `json:"marketplace_cache_ttl"` // default: 1h
  
  // Security
  MaxModuleSize int64 `json:"max_module_size"` // default: 50MB
  AllowedOrigins []string `json:"allowed_origins"` // for iframe sandbox
  RequireSignature bool `json:"require_signature"` // default: false
  
  // Runtime
  EnableIframeSandbox bool `json:"enable_iframe_sandbox"` // default: true
  ModuleTimeout time.Duration `json:"module_timeout"` // default: 30s
}
```

---

## Example Module: Terminal Pro

### File Structure

```
terminal-pro/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── manifest.json
├── src/
│   ├── Page.tsx
│   ├── hooks/
│   │   ├── usePty.ts
│   │   └── useTerminal.ts
│   ├── components/
│   │   ├── Terminal.tsx
│   │   ├── TabBar.tsx
│   │   ├── Search.tsx
│   │   └── Recording.tsx
│   └── styles.css
└── tests/
```

### Key Implementation Details

```typescript
// src/hooks/usePty.ts
import { useInstancePageContext } from '@kspanel/page-runtime';
import { useEffect, useRef, useState } from 'react';

export function usePty(cols: number, rows: number) {
  const { instance, sockets, api } = useInstancePageContext();
  const [session, setSession] = useState<PtySession | null>(null);
  const [output, setOutput] = useState<string>('');
  
  useEffect(() => {
    if (!sockets.terminal) return;
    
    api.edge.pty.spawn(cols, rows, 'bash')
      .then(s => {
        setSession(s);
        // Connect WebSocket
        const ws = new WebSocket(
          `${api.edge.baseUrl.replace('http', 'ws')}/page-module/${instance.id}/terminal-pro/pty/${s.id}`
        );
        ws.onmessage = (e) => setOutput(prev => prev + e.data);
        sockets.terminal = ws;
      });
      
    return () => {
      if (session) api.edge.pty.close(session.id);
    };
  }, []);
  
  return { session, output, write: (data: string) => api.edge.pty.write(session.id, data) };
}
```

---

## Template Integration

### TemplateForm - Page Picker

```tsx
// In TemplatePagesSection.tsx
const pageOptions = [
  ...BUILTIN_PAGE_MANIFEST.entries.map(e => ({
    value: e.slug,
    label: e.name,
    kind: 'builtin',
    icon: e.iconSvg,
    component: e.component
  })),
  ...customPages.map(p => ({
    value: p.slug,
    label: p.name,
    kind: 'custom',
    icon: p.iconSvg
  })),
  ...installedModules.map(m => ({
    value: m.manifest.slug,
    label: m.manifest.name,
    kind: 'module',
    moduleId: m.manifest.id,
    version: m.manifest.version,
    icon: m.manifest.ui.iconSvg,
    permissions: m.manifest.permissions,
    configSchema: m.manifest.configuration.schema
  }))
];
```

### Instance Config (deploy-time)

```json
{
  "pages": [
    {
      "slug": "terminal",
      "kind": "builtin",
      "label": "Terminal",
      "enabled": true
    },
    {
      "slug": "terminal-pro",
      "kind": "module",
      "moduleId": "terminal-pro",
      "version": "1.2.0",
      "label": "Terminal Pro",
      "enabled": true,
      "config": { "shell": "zsh", "theme": "solarized" },
      "permissions": { "instance": ["terminal:*"], "edge": ["exec:*"] }
    }
  ]
}
```

---

## Testing Strategy

### Unit Tests
- Manifest validation
- Permission checking
- Config schema validation

### Integration Tests
- Module install/uninstall
- Dynamic import loading
- Context passing
- Edge RPC calls

### E2E Tests
- Import module → link to template → deploy instance → use page
- Permission denied scenarios
- Module update flow

---

## Future Extensions

1. **Page Marketplace** - Curated, signed modules
2. **Module Dependencies** - Shared libraries between pages
3. **Page Composition** - Pages that embed other pages
4. **Remote Pages** - Pages hosted on external servers (OAuth)
5. **Page Analytics** - Usage tracking, error reporting
6. **A/B Testing** - Multiple versions for same slug

---

## Summary

This design provides:

✅ **Full functional pages** (Terminal, Files, Metrics, etc.) as installable modules  
✅ **Scoped permissions** - Only access what's declared and allowed  
✅ **Versioned distribution** - Semantic versioning, updates  
✅ **Instance-only scope** - No admin panel access  
✅ **Developer friendly** - Standard React, TypeScript, Vite  
✅ **Secure** - Manifest declarations, runtime validation, edge enforcement  
✅ **Extensible** - Configuration schema, capabilities, dependencies  

The key difference from mods: **Instance Pages run in instance context with instance-scoped permissions**, while mods run in admin panel context with panel-scoped permissions.