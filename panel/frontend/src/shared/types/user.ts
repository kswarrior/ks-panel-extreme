// A social link the user added to their profile. `type` is a stable key
// whose icon lives in socialIcons.tsx; `label` is an optional display
// override (defaults to the type's pretty name); `url` is the absolute URL.
export interface SocialLink {
  type: string;
  label?: string;
  url: string;
}

// Sentinel value used by the SPA's link editor to mean "the user picked a
// custom type that isn't one of the built-ins". It is never persisted: when
// selected, an extra text field is shown and the user's typed value becomes
// the stored `type` (after backend normalization/validation).
export const CUSTOM_LINK_TYPE = '__custom__';

export const SOCIAL_LINK_TYPES = [
  'youtube',
  'instagram',
  'facebook',
  'github',
  'huggingface',
  'twitter',
  'x',
  'discord',
  'website',
  'twitch',
  'tiktok',
  'linkedin',
  'reddit',
  'mastodon',
  'bluesky',
  'gitlab',
  'steam',
  'telegram',
  'patreon',
] as const;

export type SocialLinkType = (typeof SOCIAL_LINK_TYPES)[number];

export interface User {
  id: number;
  username: string;
  email: string;
  role_id: number;
  created_at: string;
  // Suspension fields (migration 037)
  suspended?: number;
  suspended_until?: string | null;
  suspension_count?: number;
  // Profile fields (migration 018). The backend always includes them now;
  // older /me payloads may omit them, so callers should default them.
  display_name?: string;
  bio?: string;
  pronouns?: string;
  accent_color?: string;
  avatar_symbol?: string;
  has_avatar?: boolean;
  has_banner?: boolean;
  social_links?: SocialLink[];
}

// Profile is the payload returned by GET /api/me/profile. Kept as its own
// type (vs. just re-using User) because the profile endpoint adds the
// avatar_url / banner_url streaming URLs that /api/me doesn't carry.
export interface Profile {
  id: number;
  username: string;
  email: string;
  role_id: number;
  created_at: string;
  display_name: string;
  bio: string;
  pronouns: string;
  accent_color: string;
  avatar_symbol: string;
  avatar_url?: string;
  banner_url?: string;
  social_links: SocialLink[];
}

export interface Role {
  id: number;
  name: string;
  display_name?: string;
  color?: string;
  description: string;
  icon?: string;
  permissions?: string[];
  // Admin-curated subset of the admin-enabled authority providers that
  // users WITH THIS ROLE are allowed to turn on for their own login.
  // undefined / null === "unrestricted" (every admin-enabled provider
  // is offered); an explicit empty array === the role disallows every
  // non-password authority. Mirrors internal/models.Role.AllowedAuthTypes.
  allowed_auth_types?: string[] | null;
}

export interface Permission {
  id: number;
  key: string;
  description: string;
}
