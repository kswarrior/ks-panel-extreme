import React from 'react';
import type { SocialLinkType } from '@/shared/types/user';

// Pretty label used when the user didn't override it. Kept inline (not a
// const map) so the JSX stays readable; the lookup is negligible.
export function socialLabel(type: string): string {
  switch (type) {
    case 'youtube': return 'YouTube';
    case 'instagram': return 'Instagram';
    case 'facebook': return 'Facebook';
    case 'github': return 'GitHub';
    case 'huggingface': return 'Hugging Face';
    case 'twitter': return 'Twitter';
    case 'x': return 'X';
    case 'discord': return 'Discord';
    case 'website': return 'Website';
    case 'twitch': return 'Twitch';
    case 'tiktok': return 'TikTok';
    case 'linkedin': return 'LinkedIn';
    case 'reddit': return 'Reddit';
    case 'mastodon': return 'Mastodon';
    case 'bluesky': return 'Bluesky';
    case 'gitlab': return 'GitLab';
    case 'steam': return 'Steam';
    case 'telegram': return 'Telegram';
    case 'patreon': return 'Patreon';
    default: return type;
  }
}

// Minimal inline brand glyphs. Each is a single <path/> so we can size + tint
// with `currentColor` + Tailwind. They're intentionally simple outlines so
// they read at the small badge size used on the profile card.
function Icon({
  type,
  className = 'w-4 h-4',
}: {
  type: string;
  className?: string;
}): React.ReactElement | null {
  // Keep the wrapping <svg> props consistent so callers can swap icons by type
  // without tweaking per-type viewBoxes.
  const props = {
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };

  switch (type) {
    case 'youtube':
      return (
        <svg {...props}>
          <rect x="2" y="5" width="20" height="14" rx="4" />
          <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
         </svg>
      );
    case 'instagram':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
         </svg>
      );
    case 'facebook':
      return (
        <svg {...props}>
          <path d="M15 3h-3a4 4 0 0 0-4 4v3H5v4h3v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
         </svg>
      );
    case 'github':
      return (
        <svg {...props}>
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.5a3 3 0 0 0-.9-2.3c3-.3 6-1.5 6-6.5a5 5 0 0 0-1.4-3.5 4.6 4.6 0 0 0-.1-3.5S18.4 1 15 3.3a13 13 0 0 0-7 0C4.6 1 3.4 1.7 3.4 1.7A4.6 4.6 0 0 0 3.3 5.2 5 5 0 0 0 2 8.7c0 5 3 6.2 6 6.5a3 3 0 0 0-.9 2.2V21" />
         </svg>
      );
    case 'huggingface':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14a3.5 3.5 0 0 0 7 0" />
          <circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none" />
         </svg>
      );
    case 'twitter':
      return (
        <svg {...props}>
          <path d="M22 4s-3 1-8 9c-1.5 2.3-2 5-2 8M2 4h5l5 14s3-1 8-9c1.5-2.3 2-5 2-8" />
         </svg>
      );
    case 'x':
      return (
        <svg {...props}>
          <path d="M4 4l16 16M20 4L4 20" />
         </svg>
      );
    case 'discord':
      return (
        <svg {...props}>
          <path d="M7.5 7.5C10 6.7 14 6.7 16.5 7.5M7.5 16.5C10 17.3 14 17.3 16.5 16.5M5 7c-1 6-1 9 0 10 2 1 4 1.3 6 1M19 7c1 6 1 9 0 10-2 1-4 1.3-6 1M9 12h.01M15 12h.01" />
         </svg>
      );
    case 'website':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
         </svg>
      );
    case 'twitch':
      return (
        <svg {...props}>
          <path d="M4 4h16v10l-4 4h-4l-3 3v-3H4z" />
          <path d="M11 8v4M16 8v4" />
         </svg>
      );
    case 'tiktok':
      return (
        <svg {...props}>
          <path d="M14 4v10a3.5 3.5 0 1 1-3-3.4M14 4c.5 2.5 2.5 4 5 4" />
         </svg>
      );
    case 'linkedin':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 10v7M7 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 17v-7" />
         </svg>
      );
    case 'reddit':
      return (
        <svg {...props}>
          <circle cx="12" cy="13" r="8" />
          <circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
          <path d="M9 16a3 3 0 0 0 6 0" />
          <path d="M5 7l5-3 3 4" />
          <circle cx="5.5" cy="7.5" r="1.5" />
         </svg>
      );
    case 'mastodon':
      return (
        <svg {...props}>
          <path d="M21 9c0 5-2 7-7 7h-2c-3 0-5-2-5-5V8c0-2 2-3 4-3s3 1 3 2v5M7 11c-2 1-3 2-3 5s2 4 5 4" />
         </svg>
      );
    case 'bluesky':
      return (
        <svg {...props}>
          <path d="M4 6c3 5 6 6 8 6s5-1 8-6M4 18c3-5 6-6 8-6s5 1 8 6" />
         </svg>
      );
    case 'gitlab':
      return (
        <svg {...props}>
          <path d="M4 9l2 7 6 4 6-4 2-7-4 2-4-7-4 7z" />
         </svg>
      );
    case 'steam':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="15" cy="10" r="2.5" />
          <circle cx="9" cy="14" r="1.5" />
          <path d="M6.5 12.5l5 2.5" />
         </svg>
      );
    case 'telegram':
      return (
        <svg {...props}>
          <path d="M21 5L3 11l5 2 2 6 3-4 5 4z" />
         </svg>
      );
    case 'patreon':
      return (
        <svg {...props}>
          <circle cx="9" cy="10" r="5" />
          <path d="M4 4v16" />
         </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M10 13a5 5 0 0 0 7 0l1-1V8a3 3 0 0 0-6 0M5 13a3 3 0 0 0 3 3" />
          <rect x="3" y="3" width="18" height="18" rx="3" />
         </svg>
      );
  }
}

export const SocialIcon = Icon;

// Default avatar symbols — built-in glyphs the user can pick when they don't
// want to upload an image. Kept as a single source of truth so the picker
// and the fallback renderer stay in sync. Each value is a short emoji-ish
// symbol; the Avatar renders it centered on the accent color.
export const DEFAULT_AVATAR_SYMBOLS = [
  '', '🚀', '🦊', '👾', '🤖', '🐧', '🐙', '🛸', '⭐', '🔥',
  '🌈', '🎮', '🦄', '🍄', '⚡', '🛰️', '🐱', '🦝', '🌲', '🌌',
] as const;

export type AvatarSymbol = (typeof DEFAULT_AVATAR_SYMBOLS)[number] | string;

// Initials fallback: when no symbol and no image, render the first two
// letters of the username/display name in the accent color circle. This
// matches Discord's default-avatar behaviour so the profile always looks
// intentional even before the user customises anything.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
