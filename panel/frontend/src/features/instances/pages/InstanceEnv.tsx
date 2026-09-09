import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { updateInstance } from '@/shared/api/admin';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey } from '@/shared/types/permissions';
import { hasPermissionAny } from '@/shared/types/permissions';
import Modal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import ErrorState from '@/shared/components/ui/ErrorState';
import PageActionsPill, { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import { useConfirm } from '@/shared/stores/confirmStore';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_VARS = 200;
const MAX_KEY_LEN = 128;
const MAX_VALUE_LEN = 8000;

interface EnvRow {
  key: string;
  value: string;
}

// parseEnvMap normalises every stored shape of config.env into a flat map:
// object {KEY: value} (deploy-time shape), array of {name,default} /
// {key,value} / {name,value} rows (template-style), or anything else → {}.
function parseEnvMap(cfg: any): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = cfg?.env;
  if (!raw) return out;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k !== 'string' || k.trim() === '') continue;
      out[k] = String(v ?? '');
    }
    return out;
  }
  if (Array.isArray(raw)) {
    for (const e of raw) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      const rec = e as Record<string, unknown>;
      const k = String(rec.name ?? rec.key ?? '').trim();
      if (k === '') continue;
      const v = String(rec.default ?? rec.value ?? '');
      out[k] = v;
    }
  }
  return out;
}

function toRows(m: Record<string, string>): EnvRow[] {
  return Object.entries(m)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));
}

function toMap(rows: EnvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function keyError(key: string, rows: EnvRow[], ignoreIdx: number): string {
  const k = key.trim();
  if (k === '') return 'Key is required.';
  if (k.length > MAX_KEY_LEN) return `Key is too long (max ${MAX_KEY_LEN}).`;
  if (!KEY_RE.test(k)) return 'Use only letters, numbers and _ — must start with a letter or _.';
  if (rows.some((r, i) => i !== ignoreIdx && r.key === k)) return `Duplicate key "${k}".`;
  return '';
}

// quoteEnvValue renders one .env line: bare when safe, double-quoted with
// escapes when the value carries newlines, leading/trailing space, # or quotes.
function quoteEnvValue(v: string): string {
  if (v === '') return '';
  if (/[\n\r]/.test(v) || /^\s|\s$/.test(v) || /[#"'`]/.test(v)) {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
  }
  return v;
}

function unquoteEnvValue(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    const inner = t.slice(1, -1);
    if (t.startsWith('"')) {
      return inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return inner;
  }
  return v.trim();
}

// InstanceEnv — native environment editor for the env shortcut slug
// (default `env`, customizable in Instance Controls). Self-sufficient builtin
// like Files / Terminal / Ports / Automation: always renders, no library
// import needed. Reads are open to any instance viewer; add / edit / delete
// / save hide behind the shortcut's "Allow Add / Edit / Delete" page option
// plus INSTANCES_EDIT|MANAGE_INSTANCES (same split as the Ports editor's
// readOnly + canEdit). Saving PUTs {config:{env}} through the existing
// UpdateInstanceHandler — env is baked at create time, so a change recreates
// the workload (the backend reports `recreated`, surfaced here as a banner).
const InstanceEnv: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const { id } = useParams();
  const instanceId = Number(id);
  const permissions = useAuthStore((s) => s.permissions);
  const canEdit = !readOnly && hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const confirm = useConfirm();
  const { instance, loading, error, reload } = useInstance(instanceId);

  const [rows, setRows] = useState<EnvRow[]>([]);
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit' | 'import'; idx: number; key: string; value: string; text: string; formError: string } | null>(null);

  const touched = useRef(false);
  const seededFor = useRef<string>('');

  // Seed from the stored config once per instance (or until the operator
  // touches the draft — a live refresh must never wipe hand-made edits).
  useEffect(() => {
    if (!instance) return;
    const sig = `${instance.id}|${typeof instance.config === 'string' ? instance.config : JSON.stringify(instance.config ?? '')}`;
    if (seededFor.current === sig) return;
    seededFor.current = sig;
    if (touched.current) return;
    try {
      const cfg = instance.config ? parseConfig(instance.config) : {};
      const m = parseEnvMap(cfg);
      setBaseline(m);
      setRows(toRows(m));
    } catch {
      setBaseline({});
      setRows([]);
    }
  }, [instance]);

  const dirty = useMemo(() => JSON.stringify(toMap(rows)) !== JSON.stringify(baseline), [rows, baseline]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q));
  }, [rows, filter]);

  const markTouched = (next: EnvRow[]) => {
    touched.current = true;
    setRows(next);
    setSavedNote('');
  };

  const openAdd = () => {
    if (rows.length >= MAX_VARS) {
      toast(`Max ${MAX_VARS} variables.`, 'error');
      return;
    }
    setModal({ mode: 'add', idx: -1, key: '', value: '', text: '', formError: '' });
  };

  const confirmModal = () => {
    if (!modal || saving) return;
    if (modal.mode === 'import') {
      const lines = modal.text.split(/\r?\n/);
      let added = 0;
      let updated = 0;
      let skipped = 0;
      const next = [...rows];
      const indexOf = (k: string) => next.findIndex((r) => r.key === k);
      for (const ln of lines) {
        const t = ln.trim();
        if (t === '' || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) {
          skipped++;
          continue;
        }
        const k = t.slice(0, eq).trim();
        if (!KEY_RE.test(k) || k.length > MAX_KEY_LEN) {
          skipped++;
          continue;
        }
        let v = unquoteEnvValue(t.slice(eq + 1));
        if (v.length > MAX_VALUE_LEN) v = v.slice(0, MAX_VALUE_LEN);
        const at = indexOf(k);
        if (at >= 0) {
          if (next[at].value !== v) {
            next[at] = { key: k, value: v };
            updated++;
          }
        } else {
          if (next.length >= MAX_VARS) {
            skipped++;
            continue;
          }
          next.push({ key: k, value: v });
          added++;
        }
      }
      next.sort((a, b) => a.key.localeCompare(b.key));
      markTouched(next);
      setModal(null);
      toast(`Import: ${added} added, ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}. Review then Save.`, skipped > 0 ? 'error' : 'success');
      return;
    }
    const k = modal.key.trim();
    const err = keyError(modal.key, rows, modal.mode === 'edit' ? modal.idx : -1);
    if (err) {
      setModal({ ...modal, formError: err });
      return;
    }
    if (modal.value.length > MAX_VALUE_LEN) {
      setModal({ ...modal, formError: `Value is too long (max ${MAX_VALUE_LEN} chars).` });
      return;
    }
    if (modal.mode === 'add') {
      if (rows.length >= MAX_VARS) {
        setModal({ ...modal, formError: `Max ${MAX_VARS} variables.` });
        return;
      }
      const next = [...rows, { key: k, value: modal.value }].sort((a, b) => a.key.localeCompare(b.key));
      markTouched(next);
    } else {
      const next = rows.map((r, i) => (i === modal.idx ? { key: k, value: modal.value } : r));
      next.sort((a, b) => a.key.localeCompare(b.key));
      markTouched(next);
    }
    setModal(null);
  };

  const handleDelete = async (key: string) => {
    const ok = await confirm({
      title: 'Remove variable?',
      message: `Remove "${key}" from this instance's environment? Saving recreates the workload.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    markTouched(rows.filter((r) => r.key !== key));
  };

  const handleSave = async () => {
    if (!canEdit || saving || !dirty) return;
    // Client-side re-validate before the PUT so one bad row can't wipe the batch.
    for (const r of rows) {
      if (!KEY_RE.test(r.key)) {
        setSaveError(`Invalid key "${r.key}" — use only letters, numbers and _.`);
        return;
      }
    }
    const ok = await confirm({
      title: 'Save environment?',
      message: `Save ${rows.length} variable${rows.length === 1 ? '' : 's'}? Environment is baked at create time — saving recreates the workload (container state is wiped and install re-runs).`,
      confirmLabel: 'Save & recreate',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    setSaveError('');
    setSavedNote('');
    try {
      const res = await updateInstance(instanceId, { config: { env: toMap(rows) } });
      touched.current = false;
      setBaseline(toMap(rows));
      await reload(true);
      if (res.recreated) {
        setSavedNote('Saved — the workload is being recreated with the new environment (creating → redeploy, install re-runs).');
      } else {
        setSavedNote('Saved.');
      }
      toast('Environment saved', 'success');
    } catch (e: any) {
      const d: unknown = e?.response?.data;
      const msg = typeof d === 'string' ? d : (d as any)?.error || e?.message || 'Failed to save environment';
      setSaveError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    touched.current = false;
    setRows(toRows(baseline));
    setSaveError('');
    setSavedNote('');
  };

  const copyDotEnv = async () => {
    const text = rows.map((r) => `${r.key}=${quoteEnvValue(r.value)}`).join('\n');
    if (text.trim() === '') {
      toast('Nothing to copy', 'error');
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text}\n`);
      } else {
        const ta = document.createElement('textarea');
        ta.value = `${text}\n`;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast('Copied .env', 'success');
    } catch {
      toast('Copy failed', 'error');
    }
  };

  const downloadDotEnv = () => {
    const text = rows.map((r) => `${r.key}=${quoteEnvValue(r.value)}`).join('\n');
    if (text.trim() === '') {
      toast('Nothing to download', 'error');
      return;
    }
    try {
      const blob = new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `instance-${instanceId}.env`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      toast('Downloaded .env', 'success');
    } catch {
      toast('Download failed', 'error');
    }
  };

  if (loading) {
    return <div className="glass-card rounded-xl p-6 animate-pulse"><div className="h-5 w-1/3 bg-neutral-800 rounded" /></div>;
  }

  if (!loading && (error || !instance)) {
    return (
      <ErrorState
        variant="error"
        title="Failed to load environment"
        description={typeof error === 'string' && error ? error : 'Instance not found.'}
        retryLabel="Retry"
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className="animate-fade-in space-y-3">
      {/* Top-right actions pill (ports pattern): filter + copy/download + add/import + save. No title
          heading — the header breadcrumb already shows the page name. */}
      <PageActionsPill outerClassName="fixed top-[max(7rem,env(safe-area-inset-top))] right-4 sm:right-6 z-40">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter variables"
          title="Filter by key or value"
          className="ks-input !w-36 !py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={() => void copyDotEnv()}
          title="Copy as .env"
          aria-label="Copy as .env"
          className="ks-btn-header ks-icon-btn shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
        <button
          type="button"
          onClick={downloadDotEnv}
          title="Download .env"
          aria-label="Download .env"
          className="ks-btn-header ks-icon-btn shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        </button>
        <button
          type="button"
          onClick={() => void reload(true)}
          title="Refresh"
          aria-label="Refresh"
          className="ks-btn-header ks-icon-btn shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
        </button>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => setModal({ mode: 'import', idx: -1, key: '', value: '', text: '', formError: '' })}
              title="Import .env text"
              aria-label="Import .env text"
              className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
              style={PILL_TAB_STYLE}
            >
              Import
            </button>
            <button
              type="button"
              onClick={openAdd}
              title="Add variable"
              aria-label="Add variable"
              className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
              style={PILL_TAB_STYLE}
            >
              <span className="inline-flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add
              </span>
            </button>
          </>
        )}
      </PageActionsPill>

      {saveError && (
        <div className="ks-card" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>{saveError}</div>
      )}
      {savedNote && (
        <div className="ks-card text-[13px] text-emerald-200 border-emerald-700/40">{savedNote}</div>
      )}
      {dirty && (
        <div className="ks-card flex flex-col sm:flex-row sm:items-center gap-2 text-[13px]">
          <span className="flex-1 text-amber-200">Unsaved changes — saving recreates the workload (container state is wiped, install re-runs).</span>
          <span className="flex gap-2 shrink-0">
            <button type="button" onClick={handleDiscard} disabled={saving} className="ks-btn disabled:opacity-40">Discard</button>
            {canEdit && (
              <button type="button" onClick={() => void handleSave()} disabled={saving} className="ks-btn-primary ks-btn disabled:opacity-40">
                {saving ? 'Saving…' : 'Save & recreate'}
              </button>
            )}
          </span>
        </div>
      )}
      {!canEdit && (
        <div className="ks-card text-[13px] text-gray-400">
          {readOnly ? 'Read-only — the template disables environment editing for this instance.' : 'You need instance edit permission to change the environment.'}
        </div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-white/10">
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">Value</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500 text-sm">
                    {rows.length === 0 ? (canEdit ? 'No variables yet. Click Add or Import to create one.' : 'No variables set on this instance.') : `No matches for "${filter}".`}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.key} className="border-b border-white/5 hover:bg-white/[0.03] align-top">
                    <td className="px-4 py-2 font-mono text-white max-w-[12rem] truncate" title={r.key}>{r.key}</td>
                    <td className="px-4 py-2 font-mono text-gray-300 break-all max-w-[28rem]" title={r.value || '(empty)'}>
                      {r.value === '' ? <span className="text-gray-600">(empty)</span> : r.value.length > 200 ? `${r.value.slice(0, 200)}…` : r.value}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canEdit ? (
                        <CardMenu
                          items={[
                            { key: 'edit', label: 'Edit' },
                            { key: 'delete', label: 'Remove', tone: 'danger' },
                          ]}
                          onSelect={(k) => {
                            if (k === 'edit') {
                              const real = rows.findIndex((x) => x.key === r.key);
                              if (real >= 0) setModal({ mode: 'edit', idx: real, key: rows[real].key, value: rows[real].value, text: '', formError: '' });
                            } else if (k === 'delete') void handleDelete(r.key);
                          }}
                          ariaLabel={`Actions for ${r.key}`}
                        />
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 text-xs text-gray-500">
          <span>{rows.length} variable{rows.length === 1 ? '' : 's'}{filter.trim() !== '' ? ` · ${filtered.length} shown` : ''}</span>
          <span>Saving recreates the workload.</span>
        </div>
      </div>

      <Modal
        open={modal !== null}
        onClose={() => { setModal(null); }}
        title={modal?.mode === 'import' ? 'Import .env' : modal?.mode === 'edit' ? `Edit "${rows[modal?.idx ?? -1]?.key ?? ''}"` : 'Add variable'}
        maxWidth="max-w-xl"
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white">Cancel</button>
            <button type="button" onClick={confirmModal} className="px-3 py-1.5 rounded-md text-sm bg-white text-black">{modal?.mode === 'import' ? 'Import' : modal?.mode === 'edit' ? 'Save' : 'Add'}</button>
          </>
        }
      >
        {modal && modal.mode === 'import' ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Paste <code className="font-mono">KEY=VALUE</code> lines (one per line, <code className="font-mono">#</code> comments ignored). Existing keys are overwritten. Review the table then Save.</p>
            <textarea
              value={modal.text}
              onChange={(e) => setModal({ ...modal, text: e.target.value.slice(0, 20000) })}
              placeholder={'API_KEY=secret\nPORT=8080\n# comment ignored'}
              rows={8}
              className="ks-input w-full ks-mono"
            />
          </div>
        ) : modal ? (
          <div className="space-y-3">
            {modal.formError && <p className="text-xs text-red-300">{modal.formError}</p>}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="env-key">Key</label>
              <input
                id="env-key"
                value={modal.key}
                onChange={(e) => setModal({ ...modal, key: e.target.value.slice(0, MAX_KEY_LEN + 10), formError: '' })}
                placeholder="API_KEY"
                disabled={modal.mode === 'edit'}
                className="ks-input w-full ks-mono disabled:opacity-60"
              />
              {modal.mode === 'edit' ? (
                <p className="text-[11px] text-gray-500 mt-1">Keys are immutable — remove and re-add to rename.</p>
              ) : (
                <p className="text-[11px] text-gray-500 mt-1">Letters, numbers and _ — must start with a letter or _.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="env-value">Value</label>
              <textarea
                id="env-value"
                value={modal.value}
                onChange={(e) => setModal({ ...modal, value: e.target.value.slice(0, MAX_VALUE_LEN + 100), formError: '' })}
                placeholder="secret value"
                rows={3}
                className="ks-input w-full ks-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1">{modal.value.length}/{MAX_VALUE_LEN}</p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default InstanceEnv;
