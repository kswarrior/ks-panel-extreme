import React, { useState } from 'react';
import GlassField from '@/shared/components/ui/Field';
import { Toggle } from '../TemplateFormComponents';
import { CONFIG_PARSERS, type ConfigFileEntry, type ConfigParser } from '../../types/templateForm';

interface Props {
  value: ConfigFileEntry[];
  onChange: (v: ConfigFileEntry[]) => void;
}

const mono = 'font-mono';

function newRow(): ConfigFileEntry {
  return { file: '', parser: 'properties', find: {}, create_if_missing: false, description: '' };
}

function parseFindText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function findToText(find: Record<string, string>): string {
  return Object.entries(find || {})
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n');
}

const TemplateConfigFilesSection: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState<number | null>(value.length > 0 ? 0 : null);
  const [preview, setPreview] = useState<Record<number, { out: string; changed: boolean; error: string; loading: boolean }>>({});

  const set = (i: number, patch: Partial<ConfigFileEntry>) => {
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const runPreview = async (i: number, sample: string) => {
    const row = value[i];
    if (!row) return;
    setPreview((p) => ({ ...p, [i]: { out: '', changed: false, error: '', loading: true } }));
    try {
      const find: Record<string, unknown> = {};
      Object.entries(row.find || {}).forEach(([k, v]) => {
        const t = (v || '').trim();
        // Allow raw JSON for multi-replace maps ({"old":"new"}).
        if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('"') && t.endsWith('"'))) {
          try {
            find[k] = JSON.parse(t);
            return;
          } catch { /* fall through as plain string */ }
        }
        find[k] = v;
      });
      const res = await fetch('/api/templates/config-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parser: row.parser, content: sample, find }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreview((p) => ({ ...p, [i]: { out: '', changed: false, error: typeof data === 'string' ? data : (data as any)?.error || 'Preview failed', loading: false } }));
        return;
      }
      setPreview((p) => ({ ...p, [i]: { out: (data as any).content || '', changed: !!(data as any).changed, error: '', loading: false } }));
    } catch (e: any) {
      setPreview((p) => ({ ...p, [i]: { out: '', changed: false, error: e?.message || 'Preview failed', loading: false } }));
    }
  };

  return (
    <div className="ks-card ks-form-card rounded-lg space-y-4">
      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Section · Config Files</h4>
        <p className="text-[11px] text-gray-500 mt-1">
          Ptero <span className={mono}>config.files</span> parity + TOML extra. Patched post-install inside the workload and re-synced pre-start.
          Key paths: <span className={mono}>server.port</span>, <span className={mono}>listeners[0].port</span>, <span className={mono}>servers.*.address</span> (yaml/json),{' '}
          <span className={mono}>section.key</span> (ini/toml), <span className={mono}>tag</span> / <span className={mono}>tag@attr</span> (xml). Values accept{' '}
          <span className={mono}>{'{{VAR}}'}</span> (deploy env).
        </p>
      </div>

      {value.length === 0 && (
        <p className="text-xs text-gray-500">No parsers yet — every game currently reinvents file writes via actions. Add one for e.g. server.properties.</p>
      )}

      {value.map((row, i) => {
        const expanded = open === i;
        const pv = preview[i];
        return (
          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : i)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03]"
            >
              <span className="text-xs font-mono text-sky-200 truncate flex-1">{row.file || `config_${i + 1}`} · {row.parser}</span>
              <span className="text-[10px] text-gray-500">{Object.keys(row.find || {}).length} keys</span>
              <span className="text-gray-500 text-xs">{expanded ? '▾' : '▸'}</span>
            </button>
            {expanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <GlassField label="File (relative, e.g. server.properties)" htmlFor={`cfg-file-${i}`}>
                    <input
                      id={`cfg-file-${i}`}
                      value={row.file}
                      onChange={(e) => set(i, { file: e.target.value })}
                      placeholder="server.properties"
                      className={mono}
                    />
                  </GlassField>
                  <GlassField label="Parser" htmlFor={`cfg-parser-${i}`}>
                    <select
                      id={`cfg-parser-${i}`}
                      value={row.parser}
                      onChange={(e) => set(i, { parser: e.target.value as ConfigParser })}
                    >
                      {CONFIG_PARSERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} — {p.hint}
                        </option>
                      ))}
                    </select>
                  </GlassField>
                </div>
                <GlassField label="Find (one per line: key = value; JSON object for multi-replace)" htmlFor={`cfg-find-${i}`}>
                  <textarea
                    id={`cfg-find-${i}`}
                    rows={4}
                    value={findToText(row.find)}
                    onChange={(e) => set(i, { find: parseFindText(e.target.value) })}
                    placeholder={row.parser === 'properties' ? 'server-port = {{SERVER_PORT}}\nmotd = {{MOTD}}' : row.parser === 'yaml' ? 'server.port = {{SERVER_PORT}}' : 'server.port = {{SERVER_PORT}}'}
                    className={mono}
                  />
                </GlassField>
                <div className="flex flex-wrap items-center gap-4">
                  <Toggle checked={!!row.create_if_missing} onChange={(v) => set(i, { create_if_missing: v })} label="Create if missing" />
                  <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-xs text-red-300 hover:text-red-200 underline ml-auto">
                    Remove
                  </button>
                </div>
                <GlassField label="Description (optional)" htmlFor={`cfg-desc-${i}`}>
                  <input id={`cfg-desc-${i}`} value={row.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Why this file is patched" />
                </GlassField>
                <details className="rounded border border-white/10 bg-black/20 p-2">
                  <summary className="text-xs text-gray-400 cursor-pointer">Tester (preview against sample content)</summary>
                  <div className="mt-2 space-y-2">
                    <textarea
                      rows={4}
                      placeholder={row.parser === 'properties' ? 'server-port=25565' : row.parser === 'json' ? '{"server":{"port":25565}}' : 'paste current file content here'}
                      className={`w-full text-xs rounded border border-white/10 bg-black/30 p-2 text-gray-200 ${mono}`}
                      id={`cfg-sample-${i}`}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`cfg-sample-${i}`) as HTMLTextAreaElement | null;
                          runPreview(i, el?.value || '');
                        }}
                        className="px-2.5 py-1 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white"
                      >
                        {pv?.loading ? 'Running…' : 'Run preview'}
                      </button>
                      {pv?.changed && <span className="text-[11px] text-emerald-300">patched</span>}
                      {pv && !pv.loading && !pv.error && !pv.changed && <span className="text-[11px] text-gray-500">already in sync</span>}
                    </div>
                    {pv?.error && <p className="text-xs text-red-300 whitespace-pre-wrap">{pv.error}</p>}
                    {pv?.out && <pre className={`max-h-40 overflow-auto text-[11px] text-gray-200 whitespace-pre-wrap break-all ${mono}`}>{pv.out}</pre>}
                  </div>
                </details>
              </div>
            )}
          </div>
        );
      })}

      <div>
        <button type="button" onClick={() => { onChange([...value, newRow()]); setOpen(value.length); }} className="text-xs text-sky-300 hover:text-sky-200 underline">
          + Add config file
        </button>
      </div>
    </div>
  );
};

export default TemplateConfigFilesSection;
