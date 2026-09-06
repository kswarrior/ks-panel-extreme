import client from '@/shared/api/client';

// Custom panel pages (Settings > Pages: About, Docs, …).
// CRUD is settings-gated; nav + bySlug only need a session (each page's
// own role allow-list filters visibility server-side).

export interface PanelPage {
  id: number;
  slug: string;
  name: string;
  icon_svg: string;
  content_type: 'html' | 'markdown';
  content: string;
  enabled: boolean;
  role_ids: number[];
  sort_order: number;
}

export interface PanelPageNav {
  slug: string;
  name: string;
  icon_svg: string;
  url: string;
}

export interface PanelPageInput {
  slug: string;
  name: string;
  icon_svg: string;
  content_type: 'html' | 'markdown';
  content: string;
  enabled: boolean;
  role_ids: number[];
  sort_order: number;
}

export async function listPanelPages(): Promise<PanelPage[]> {
  const res = await client.get<PanelPage[]>('/api/panel-pages/');
  return Array.isArray(res.data) ? res.data : [];
}

export async function createPanelPage(input: PanelPageInput): Promise<PanelPage> {
  const res = await client.post<PanelPage>('/api/panel-pages/', input);
  return res.data;
}

export async function updatePanelPage(id: number, input: PanelPageInput): Promise<PanelPage> {
  const res = await client.put<PanelPage>(`/api/panel-pages/${id}`, input);
  return res.data;
}

export async function deletePanelPage(id: number): Promise<void> {
  await client.delete(`/api/panel-pages/${id}`);
}

export async function fetchPanelPagesNav(): Promise<PanelPageNav[]> {
  const res = await client.get<PanelPageNav[]>('/api/panel-pages/nav');
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchPanelPageBySlug(slug: string): Promise<PanelPage> {
  const res = await client.get<PanelPage>(`/api/panel-pages/slug/${encodeURIComponent(slug)}`);
  return res.data;
}

// slugify turns a display name into a URL slug live while typing
// ("User Docs" → "user-docs"), mirroring the server's slug rule.
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

// sanitizeInlineSvg strips executable constructs before an SVG string is
// inlined into panel DOM (sidebar glyphs, editor previews). The SERVER
// re-sanitizes on save (sanitizeIconSVG) — this is the render-side belt
// to those suspenders, never the trust boundary.
export function sanitizeInlineSvg(raw: string): string {
  let cur = raw || '';
  for (let i = 0; i < 5; i++) {
    const prev = cur;
    cur = cur
      .replace(/<\s*\/?\s*(script|foreignObject|iframe|object|embed|animate|set|handler)\b[^>]*>?/gis, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|xlink:href|src|from|to|values|style)\s*=\s*("\s*(javascript|vbscript|data:text\/html)[^"]*"|'[^']*'|(?:javascript|vbscript|data:text\/html)[^\s>]*)/gi, '');
    if (cur === prev) break;
  }
  return cur;
}
