import client from '@/shared/api/client';

// Public authority-branding snapshot for the login page (no auth needed —
// the page renders before the user has a session). Precedence is resolved
// server-side: authority-specific branding wins when configured, otherwise
// the GLOBAL panel brand (panel_name + panel-logo) is the fallback, so the
// login page keeps rendering the operator's brand either way.
export interface AuthorityBranding {
  panel_name: string;
  logo_url?: string;
  logo_source: 'authority' | 'global' | 'none';
  background_url?: string;
  background_type?: 'image' | 'gradient';
  background_source: 'authority' | 'none';
}

export async function fetchAuthorityBranding(): Promise<AuthorityBranding> {
  const res = await client.get<AuthorityBranding>('/api/authority/branding');
  return res.data;
}
