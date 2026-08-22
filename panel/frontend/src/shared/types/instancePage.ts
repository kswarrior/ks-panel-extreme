// Instance Page types for the admin Instance Pages page.
// These represent reusable page definitions that can be used across templates.

export type InstancePageKind = 'builtin' | 'custom' | 'module'

export interface InstancePage {
  id: number
  name: string
  description: string
  slug: string
  kind: InstancePageKind
  category: string
  content_type: 'html' | 'markdown' | 'blocks' | '' | 'module'
  content_html: string
  content_markdown: string
  content_blocks: string
  icon_svg: string
  created_at: string
  updated_at: string
  // Module-specific fields
  module_id?: string
  module_version?: string
  module_manifest?: Record<string, any>
}

export interface CreateInstancePagePayload {
  name: string
  description: string
  slug: string
  kind: InstancePageKind
  category: string
  content_type: 'html' | 'markdown' | 'blocks' | 'module'
  content_html: string
  content_markdown: string
  content_blocks: string
  icon_svg: string
  // Module fields
  module_id?: string
  module_version?: string
  module_manifest?: Record<string, any>
}

export interface UpdateInstancePagePayload {
  name: string
  description: string
  slug: string
  kind: InstancePageKind
  category: string
  content_type: 'html' | 'markdown' | 'blocks' | 'module'
  content_html: string
  content_markdown: string
  content_blocks: string
  icon_svg: string
  // Module fields
  module_id?: string
  module_version?: string
  module_manifest?: Record<string, any>
}