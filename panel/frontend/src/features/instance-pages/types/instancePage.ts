// Instance Page types for the admin Instance Pages page.
// These represent reusable page definitions that can be used across templates.

export type InstancePageKind = 'builtin' | 'custom';

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
}