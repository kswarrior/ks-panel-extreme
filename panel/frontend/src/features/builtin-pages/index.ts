// const builtin = require('./builtin');
// BUILTIN PAGE MANIFEST — single source of truth for built-in instance
// sub-pages. One TSX file per page (Home/Files/Network/Terminal/Settings/
// Env/Automation/Processes/Metrics/Ports/Backups/Audit) each owns a
// BuiltinPageManifestEntry. This file imports them all and exposes:
//   • BUILTIN_PAGE_MANIFEST.entries   — ordered list (picker ordering)
//   • BUILTIN_PAGE_MANIFEST.bySlug    — slug → entry
//   • BUILTIN_PAGE_MANIFEST.slugs     — enabled-by-default slug list
//   • BUILTIN_PAGE_MANIFEST.getComponent(slug, spec) — resolves a sidebar
//     slug to the actual React component, honouring renamed built-in slugs
//     (e.g. /console → Terminal component) and disabled pages.
//
// Both the TemplateForm's "Add Page" picker and the instance sidebar/
// InstanceDynamicPage read from here so built-in and custom pages share
// one workflow: there is no "whitelist" distinction — a built-in page is
// just a row in this manifest, and a custom page is just a row the
// template author created in the picker.
import HomeEntry from './Home';
import FilesEntry from './Files';
import NetworkEntry from './Network';
import TerminalEntry from './Terminal';
import SettingsEntry from './Settings';
import EnvEntry from './Env';
import AutomationEntry from './Automation';
import ProcessesEntry from './Processes';
import MetricsEntry from './Metrics';
import PortsEntry from './Ports';
import BackupsEntry from './Backups';
import AuditEntry from './Audit';
import type { BuiltinPageManifest, BuiltinPageManifestEntry } from './types';
import type React from 'react';

// Keep the import order aligned with the previous BUILTIN_PAGES list so
// the picker renders in the same hydrogen (Home → Files → Network → …).
const entries: BuiltinPageManifestEntry[] = [
  HomeEntry,
  FilesEntry,
  NetworkEntry,
  TerminalEntry,
  EnvEntry,
  AutomationEntry,
  ProcessesEntry,
  MetricsEntry,
  PortsEntry,
  BackupsEntry,
  AuditEntry,
  SettingsEntry,
];

const bySlug: Record<string, BuiltinPageManifestEntry> = {};
for (const e of entries) bySlug[e.slug] = e;

// getComponent resolves the component for a resolved sidebar slug given
// the template spec. Returns null when:
//   • the slug isn't a built-in (caller falls back to custom-page check)
//   • the slug is a renamed built-in but its original_slug isn't in the
//     manifest (corrupt spec)
//   • the page entry has enabled === false
// Mirrors slugToComponent() from instancePages.ts but returns the
// actual React component instead of a string component name.
export function getBuiltinComponent(
  slug: string,
  spec: Record<string, any> | null | undefined,
): React.ComponentType | null {
  const pages = Array.isArray(spec?.pages) ? spec!.pages : [];

  // 1. Renamed built-in: spec row whose current `slug` matches the
  //    resolved route AND carries an original_slug. Resolve to the
  //    manifest entry for that original.
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.slug === 'string' && p.slug === slug && typeof p.original_slug === 'string') {
      const entry = bySlug[p.original_slug];
      if (!entry) return null;
      if (p.enabled === false) return null;
      return entry.component;
    }
  }

  // 2. Direct built-in match: spec row whose slug matches AND isn't a
  //    custom page. Falls through to the manifest's component for that slug.
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (p.kind !== 'custom' && typeof p.slug === 'string' && p.slug === slug) {
      if (p.enabled === false) return null;
      const entry = bySlug[slug];
      if (!entry) return null;
      return entry.component;
    }
  }

  // 3. Manifest fallback: built-in without an explicit spec row still
  //    resolves if the manifest has an entry (handled only when the spec
  //    is permissive — e.g. legacy specs pre-dating the empty-by-default
  //    change where every built-in was implicitly enabled).
  //
  //    Home ('.') is special-cased here: it must ALWAYS resolve to the
  //    built-in Home component unless the template explicitly disabled
  //    it (`{ slug: '.', enabled: false }`). Without this carve-out the
  //    operator lands on a blank "not part of this instance's template"
  //    card on legacy templates / empty specs — losing status, identity,
  //    install state, and the template actions card.
  if (slug === '.' && !pages.some((p) => p && typeof p === 'object' && p.slug === '.' && p.enabled === false)) {
    const homeEntry = bySlug['.'];
    if (homeEntry) return homeEntry.component;
  }
  const entry = bySlug[slug];
  return entry ? entry.component : null;
}

export const BUILTIN_PAGE_MANIFEST: BuiltinPageManifest = {
  entries,
  bySlug,
};

// Default export convenience: the ordered list of slugs, useful for
// legacy callers that just need BUILTIN_PAGES.map(b => b.slug).
export const BUILTIN_PAGE_SLUGS: string[] = entries.map((e) => e.slug);

export { type BuiltinPageManifest, type BuiltinPageManifestEntry } from './types';
