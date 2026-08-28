// Instance Page types for the admin Instance Pages page.
// These represent reusable page definitions that can be used across templates.

export type InstancePageKind = 'builtin' | 'custom';

// PageActionDef is one persisted executable page action (mirrors the edge
// page-action input minus the token). `name` is the stable key the runtime
// uses to run it (KSPageSDK.runAction(name)).
export interface PageActionDef {
  name: string;
  type: 'shell' | 'read_file' | 'write_file' | 'list_files' | 'docker' | 'kvm' | 'lxd';
  command?: string;
  path?: string;
  content?: string;
  args?: string[];
  /** Opt-in: the page may append up to 4 runtime argument values after the
   *  stored static args (shell commands substitute them into {{args}});
   *  every value is validated server-side before execution. */
  open_args?: boolean;
  env?: Record<string, string>;
  timeout?: number;
  description?: string;
}

export interface InstancePage {
  id: number;
  name: string;
  description: string;
  slug: string;
  kind: InstancePageKind;
  category: string;
  /** Page flavor tag (dashboard, status, docs, …) — persisted as page_type. "" == unset. */
  type: string;
  content_type: 'html' | 'markdown' | 'blocks' | '';
  content_html: string;
  content_markdown: string;
  content_blocks: string;
  icon_svg: string;
  /** JSON-encoded array of PageActionDef. Empty string == none. */
  actions: string;
  /** JSON-encoded array of InstancePageSubPage (multi-page support).
   *  Empty string == none. */
  sub_pages: string;
  created_at: string;
  updated_at: string;
}

// InstancePageSubPage is one extra page shipped inside a library page
// definition. The effective slug is `<page.slug>/<path>` (e.g. files/edit).
export interface InstancePageSubPage {
  path: string;
  name: string;
  content_type: 'html' | 'markdown' | 'blocks';
  content_html?: string;
  content_markdown?: string;
  content_blocks?: string;
}

// parseSubPages decodes the persisted sub_pages JSON into typed entries.
// Corrupt payloads degrade to an empty list so a bad row never blocks the UI.
export function parseSubPages(json: string | undefined | null): InstancePageSubPage[] {
  if (!json || !json.trim()) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (s): s is InstancePageSubPage =>
        !!s && typeof s === 'object' && typeof s.path === 'string' && typeof s.name === 'string',
    );
  } catch {
    return [];
  }
}

// parsePageActions decodes the persisted actions JSON into typed defs.
// Corrupt payloads degrade to an empty list so a bad row never blocks the UI
// (the runtime allow-list just ends up empty — same as "no actions").
export function parsePageActions(json: string | undefined | null): PageActionDef[] {
  if (!json || !json.trim()) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (a): a is PageActionDef =>
        !!a && typeof a === 'object' && typeof a.name === 'string' && typeof a.type === 'string',
    );
  } catch {
    return [];
  }
}

export interface CreateInstancePagePayload {
  name: string;
  description: string;
  slug: string;
  kind: InstancePageKind;
  category: string;
  type: string;
  content_type: 'html' | 'markdown' | 'blocks';
  content_html: string;
  content_markdown: string;
  content_blocks: string;
  icon_svg: string;
  actions: string;
  sub_pages?: string;
}

export interface UpdateInstancePagePayload {
  name: string;
  description: string;
  slug: string;
  kind: InstancePageKind;
  category: string;
  type: string;
  content_type: 'html' | 'markdown' | 'blocks';
  content_html: string;
  content_markdown: string;
  content_blocks: string;
  icon_svg: string;
  actions: string;
  sub_pages?: string;
}