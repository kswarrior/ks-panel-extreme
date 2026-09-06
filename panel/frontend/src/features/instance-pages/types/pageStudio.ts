// PageStudio types — mirrors templates/types/templateForm.ts split style.
//
// Single source of truth for the Instance Page Studio's tab model, editing
// shapes (ActionRow / SubPageRow / BlockRow) and option lists. Keeping it
// here keeps the page component small and makes each section component's
// props type-safe without circular imports.

import type { InstancePageAction } from '@/shared/api/admin';
import type { InstancePageSubPage, PageActionDef } from './instancePage';

// ---------------------------------------------------------------------------
// Tabs — same pattern as TEMPLATE_TABS in templates/types/templateForm.ts
// ---------------------------------------------------------------------------

export type PageStudioTabId = 'editor' | 'subpages' | 'actions' | 'preview' | 'settings' | 'components' | 'configure';

export const PAGE_STUDIO_TABS: Array<{ id: PageStudioTabId; label: string }> = [
  { id: 'editor', label: 'Main page' },
  { id: 'subpages', label: 'Sub-pages' },
  { id: 'actions', label: 'Actions' },
  { id: 'components', label: 'Components' },
  { id: 'configure', label: 'Configure' },
  { id: 'preview', label: 'Preview' },
  { id: 'settings', label: 'Settings' },
];

// Suggestion lists for the Settings tab Category / Type pickers — same
// suggest-or-add-free-text UX as the template editor's tag pickers.
export const CATEGORY_OPTIONS = ['monitoring', 'docs', 'tools', 'dashboard', 'system', 'minecraft', 'other'];
export const TYPE_OPTIONS = ['dashboard', 'status', 'docs', 'admin-panel', 'widget', 'generic'];

// ---------------------------------------------------------------------------
// Editing shapes — local row types the studio edits before serialising
// ---------------------------------------------------------------------------

export interface ActionRow {
  id: string;
  name: string;
  type: InstancePageAction['type'];
  command: string;
  path: string;
  content: string;
  args: string;
  open_args: boolean;
  env: string;
  timeout: string;
  description: string;
}

export interface ComponentRow {
  id: string;
  name: string;
  type: 'html' | 'markdown' | 'block';
  description: string;
  content: string;
}

export interface SubPageRow {
  id: string;
  path: string;
  name: string;
  content_type: 'html' | 'markdown' | 'blocks';
  content_html: string;
  content_markdown: string;
  content_blocks: string;
}

export interface ConfigureRow {
  id: string;
  name: string;
  label: string;
  description: string;
  default: string;
  user_viewable: boolean;
  user_editable: boolean;
  required: boolean;
  rule: string;
  display: 'text' | 'number' | 'select' | 'checkbox' | 'toggle';
  options: string;
  append: boolean;
  prepend: string;
  append_value: string;
}

export interface BlockRow {
  type: 'heading' | 'text' | 'image' | 'button' | 'spacer' | 'code' | 'divider'
    | 'stat' | 'table' | 'list' | 'html' | 'action';
  value: string;
  href?: string;
  level?: 1 | 2 | 3;
  align?: 'left' | 'center' | 'right';
  label?: string;
  unit?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  action?: string;
  confirmText?: string;
}

export const BLOCK_TYPES: { type: BlockRow['type']; label: string }[] = [
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Link button' },
  { type: 'stat', label: 'Stat card' },
  { type: 'table', label: 'Table (JSON rows)' },
  { type: 'list', label: 'List (JSON or lines)' },
  { type: 'code', label: 'Code block' },
  { type: 'html', label: 'Raw HTML' },
  { type: 'action', label: 'Action button' },
  { type: 'spacer', label: 'Spacer' },
  { type: 'divider', label: 'Divider' },
];

// ---------------------------------------------------------------------------
// Theme-level helpers shared with sections
// ---------------------------------------------------------------------------

export const sectionCls = 'ks-card ks-form-card rounded-lg space-y-4';
export const labelCls = 'block text-sm font-medium text-gray-300 mb-1 ks-label';
export const monoCls = 'glass-field font-mono ks-input-mono';
export const addBtn = 'text-xs text-sky-300 hover:text-sky-200 underline';
