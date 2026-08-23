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
  content_type: 'html' | 'markdown' | 'blocks' | '';
  content_html: string;
  content_markdown: string;
  content_blocks: string;
  icon_svg: string;
  /** JSON-encoded array of PageActionDef. Empty string == none. */
  actions: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInstancePagePayload {
  name: string;
  description: string;
  slug: string;
  kind: InstancePageKind;
  category: string;
  content_type: 'html' | 'markdown' | 'blocks';
  content_html: string;
  content_markdown: string;
  content_blocks: string;
  icon_svg: string;
  actions: string;
}

export interface UpdateInstancePagePayload {
  name: string;
  description: string;
  slug: string;
  kind: InstancePageKind;
  category: string;
  content_type: 'html' | 'markdown' | 'blocks';
  content_html: string;
  content_markdown: string;
  content_blocks: string;
  icon_svg: string;
  actions: string;
}