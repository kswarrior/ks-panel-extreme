// nodeIcons — the icon + accent-colour registry the NodeForm's General tab
// manages and the node cards render. Preset keys must stay in sync with
// `nodeIconKeys` in
// panel/backend/internal/api/handlers/node_handler.go: the API validates
// incoming preset icons against exactly that whitelist (fail closed), and
// additionally accepts a pasted full `<svg>…</svg>` block (length-capped,
// script-stripped) for the "Custom" dropdown choice.
import React from 'react';

export interface NodeIconDef {
  key: string;
  label: string;
  /** SVG path data drawn inside a 24x24 stroke viewBox (lucide style). */
  paths: string[];
}

export const NODE_ICONS: NodeIconDef[] = [
  {
    key: 'server',
    label: 'Server',
    paths: [
      'M4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
      'M7 6.5h.01',
      'M4 14h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
      'M7 17.5h.01',
    ],
  },
  {
    key: 'cloud',
    label: 'Cloud',
    paths: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  },
  {
    key: 'globe',
    label: 'Globe',
    paths: [
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
      'M2 12h20',
      'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
    ],
  },
  {
    key: 'shield',
    label: 'Shield',
    paths: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  },
  {
    key: 'cpu',
    label: 'CPU',
    paths: [
      'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
      'M9 9h6v6H9z',
      'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2',
    ],
  },
  {
    key: 'database',
    label: 'Database',
    paths: [
      'M4 6a8 3 0 1 0 16 0 8 3 0 1 0-16 0z',
      'M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6',
      'M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6',
    ],
  },
  {
    key: 'drive',
    label: 'Drive',
    paths: [
      'M22 12H2',
      'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
      'M6 16h.01M10 16h.01',
    ],
  },
  {
    key: 'box',
    label: 'Box',
    paths: [
      'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
      'm3.3 7 8.7 5 8.7-5',
      'M12 22V12',
    ],
  },
  { key: 'zap', label: 'Bolt', paths: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'] },
  {
    key: 'home',
    label: 'Home',
    paths: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M9 21v-6h6v6'],
  },
  {
    key: 'network',
    label: 'Network',
    paths: [
      'M17 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
      'M3 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
      'M10 2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
      'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3',
      'M12 12V8',
    ],
  },
  {
    key: 'terminal',
    label: 'Terminal',
    paths: ['m4 17 6-5-6-5', 'M12 19h8'],
  },
];

export function nodeIconByKey(key: string): NodeIconDef | undefined {
  return NODE_ICONS.find((i) => i.key === key);
}

/** isCustomNodeIconSvg reports whether s is a pasted full `<svg>…</svg>`
 * markup block (the "Custom" dropdown choice) rather than a registry key. */
export function isCustomNodeIconSvg(s: string): boolean {
  return s.trim().toLowerCase().startsWith('<svg');
}

/** sanitizeCustomIconSvg strips the active content a pasted SVG could carry
 * (scripts, event-handler attributes, javascript: URLs) so a custom icon
 * can never execute code where it is rendered. */
export function sanitizeCustomIconSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');
}

/** Curated accent palette offered as one-click swatches in the form. */
export const NODE_COLORS: string[] = [
  '#34d399',
  '#38bdf8',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#f87171',
  '#fbbf24',
  '#fb923c',
  '#a3e635',
  '#2dd4bf',
];

/** NodeIcon renders a registered icon by key, or a pasted custom `<svg>`
 * block (sanitized); returns null for unknown/empty keys so callers can
 * fall back to the default heartbeat glyph. */
export const NodeIcon: React.FC<{ icon: string; className?: string }> = ({
  icon,
  className,
}) => {
  if (isCustomNodeIconSvg(icon)) {
    return (
      <span
        className={`inline-flex items-center justify-center [&>svg]:h-full [&>svg]:w-full ${className ?? ''}`}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: sanitizeCustomIconSvg(icon) }}
      />
    );
  }
  const def = nodeIconByKey(icon);
  if (!def) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {def.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
};
