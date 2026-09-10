// Shared YAML document helpers for the template system.
//
// Template specs are stored as canonical YAML (legacy JSON rows parse
// identically and auto-migrate to YAML on the next save). YAML is a
// superset of JSON, so `parse` below accepts both syntaxes — old JSON
// specs and hand-written YAML manifests decode through this one path.

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// parseSpecDocument decodes a template spec (YAML or legacy JSON) into a
// plain object. Empty / whitespace-only input yields {}. Non-object
// documents (a bare string, list, or number) also yield {} so form loaders
// never crash on a corrupt spec — callers that need to surface corruption
// should compare against the raw string themselves.
export function parseSpecDocument(raw: string): Record<string, any> {
  if (!raw || !raw.trim()) return {};
  try {
    const doc: unknown = parseYaml(raw);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {};
    return doc as Record<string, any>;
  } catch {
    return {};
  }
}

// stringifySpecDocument encodes a spec object as canonical YAML for
// storage. Empty input yields '{}\n' (the YAML empty-object form) so NOT
// NULL columns and old "{}" readers keep working.
export function stringifySpecDocument(obj: unknown): string {
  if (!obj || (typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj as Record<string, unknown>).length === 0)) {
    return '{}\n';
  }
  return stringifyYaml(obj);
}
