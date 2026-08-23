// Env (instance secrets) — built-in instance sub-page (self-contained).
//
// Moved verbatim out of pages/panel/InstanceAdvancedPages.tsx; the cross-page
// UI vocabulary (Section/Btn/Field, useInstanceFromParams, LoadingOrError,
// TableSkeleton/CardGridSkeleton/TilesSkeleton, asArray/errText, timeAgo, …)
// is imported from ./_shared so the same helpers aren't duplicated. Default
// export is the BuiltinPageManifestEntry consumed by lib/builtin/index.ts;
// pages/panel/InstanceAdvancedPages.tsx re-exports this component + its
// boundary-wrapped *Page variant as a facade.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listTemplates } from '@/shared/api/admin';
import { parseConfig } from '@/shared/hooks/useInstance';
import { isPageAllowed } from '@/shared/utils/instancePages';
import {
  listSecrets, setSecret, revealSecret, deleteSecret,
  listAutomation, createAutomation, updateAutomation, deleteAutomation,
  listAutomationRuns, runAutomationNow,
  listProcesses, killProcess,
  getMetrics,
  listPorts,
  listSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot,
  listInstanceAudit,
} from '@/features/instances/api/instanceAdvanced';
import type {
  Secret, SecretUpsert,
  Automation, AutomationUpsert, AutomationRun, AutomationRunResult,
  InstanceSnapshot,
  InstanceAuditRow,
  ProcessRow, PortRow, MetricsSnapshot,
} from '@/shared/types/instanceAdvanced';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import type { CardMenuItem } from '@/shared/components/ui/CardMenu/CardMenu';
import GlassModal from '@/shared/components/ui/Modal';
import {
  AreaChart, DonutChart, GaugeChart, Sparkline, TrendDelta, HealthBadge,
  healthOf, fmtClock,
  type MetricSample, type Health,
} from '@/shared/components/ui/MetricsChart';
import {
  parseBytes, joinPath, timeAgo,
  KIND_BADGE, kindBadgeClass, STATUS_META, statusMeta, KindIcon,
  cleanExternalId, INSTANCE_NAV,
  Section, EmptyRow, InfoRow, inputCls, Btn, Field,
  useInstanceFromParams, PageErrorBoundary, withBoundary,
  LoadingOrError, TableSkeleton, CardGridSkeleton, TilesSkeleton,
  asArray, errText,
} from './_shared';
import type { LoadingKind } from './_shared';
import type { BuiltinPageManifestEntry } from './types';

export const InstanceEnv: React.FC = () => {
  const { instance, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<SecretUpsert>({ key: '', value: '', is_secret: true, description: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Secret | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await listSecrets(instanceId);
      setSecrets(asArray<Secret>(r));
    } catch (e: any) {
      setError(errText(e, 'Failed to load secrets'));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  if (!instance) return <LoadingOrError loading={false} error="Instance not found" kind="env" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="env" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('env', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

  const openCreate = () => {
    setEditing(null);
    setDraft({ key: '', value: '', is_secret: true, description: '' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (secret: Secret) => {
    setEditing(secret);
    setDraft({ 
      key: secret.key, 
      value: secret.value || '', 
      is_secret: secret.is_secret, 
      description: secret.description || '' 
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async () => {
    if (!draft.key) { setFormError('Key is required.'); return; }
    setBusy(true); setFormError('');
    try {
      if (editing) {
        await setSecret(instanceId, { ...draft, key: editing.key }); // Keep original key when editing
      } else {
        await setSecret(instanceId, draft);
      }
      setDraft({ key: '', value: '', is_secret: true, description: '' });
      // Clear revealed state for this key since it may have changed
      setRevealed((m) => { 
        const keyToClear = editing ? editing.key : draft.key;
        const c = { ...m }; 
        delete c[keyToClear]; 
        return c; 
      });
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setFormError(errText(e, 'Failed to save'));
    } finally { setBusy(false); }
  };

  const reveal = async (key: string) => {
    try {
      const r = await revealSecret(instanceId, key);
      setRevealed((m) => ({ ...m, [key]: r.value }));
    } catch (e: any) {
      setFormError(errText(e, 'Reveal failed'));
    }
  };

  const remove = async (key: string) => {
    if (!confirm(`Delete secret "${key}"? This cannot be undone.`)) return;
    try {
      await deleteSecret(instanceId, key);
      setRevealed((m) => { const c = { ...m }; delete c[key]; return c; });
      await load();
    } catch (e: any) {
      setFormError(errText(e, 'Delete failed'));
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Env & Secrets</h2>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={openCreate}>+ Add</Btn>
          <Btn onClick={load} disabled={loading}>Refresh</Btn>
        </div>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      {/* Create / Edit modal */}
      <GlassModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit “${editing.key}”` : 'Add variable'}
        maxWidth="max-w-xl"
        footer={
          <>
            <Btn onClick={() => setModalOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : (editing ? 'Save' : 'Add variable')}</Btn>
          </>
        }
      >
        {formError && <p className="text-xs text-red-300">{formError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Key (unique per instance)" hint={editing ? 'Keys are immutable — delete and re-create to rename a variable.' : undefined}>
            {/* The key is the primary identifier in the vault, so renames
                are disallowed: submit() keeps editing.key when editing.
                Locking the field readOnly while editing prevents the user
                from typing a new key that would be silently discarded. */}
            <input className={inputCls} value={draft.key}
              onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
              placeholder="DATABASE_URL"
              readOnly={!!editing} />
          </Field>
          <Field label="Value" hint={draft.is_secret ? 'Stored encrypted; masked in the list view.' : 'Stored as a visible env var.'}>
            <input className={inputCls} value={draft.value} type={draft.is_secret ? 'password' : 'text'}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              placeholder={draft.is_secret ? '••••••••' : 'production'} />
          </Field>
          <Field label="Description (optional)">
            <input className={inputCls} value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Primary DB connection string" />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input type="checkbox" checked={draft.is_secret}
                onChange={(e) => setDraft((d) => ({ ...d, is_secret: e.target.checked }))} />
              Mask as secret
            </label>
          </div>
        </div>
      </GlassModal>

        <Section title={`Vaulted variables (${secrets.length})`} description="Audit rows are written on every set / reveal / delete.">
          {loading ? (
            <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-card rounded-xl animate-pulse">
                  <div className="h-4 w-1/2 bg-neutral-800 rounded mb-3" />
                  <div className="h-3 w-2/3 bg-neutral-800 rounded mb-2" />
                  <div className="h-3 w-1/3 bg-neutral-800 rounded" />
                </div>
              ))}
           </div>
            ) : secrets.length === 0 ? (
              <Section><EmptyRow text="No variables stored. Click “Add” to add one." /></Section>
            ) : (
              <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {secrets.map((s) => (
                  <div key={s.key} className="glass-card rounded-xl flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{s.key}</div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${s.is_secret ? 'bg-amber-900/40 text-amber-200 border-amber-700/50' : 'bg-sky-900/40 text-sky-200 border-sky-700/50'}`}>
                          {s.is_secret ? 'secret' : 'env'}
                        </span>
                      </div>
                      <CardMenu
                        items={[
                          { key: 'edit', label: 'Edit', tone: 'default' },
                          { key: 'delete', label: 'Delete', tone: 'danger' },
                        ]}
                        onSelect={(k) => {
                          if (k === 'edit') openEdit(s);
                          else if (k === 'delete') remove(s.key);
                        }}
                        ariaLabel={`Actions for ${s.key}`}
                      />
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-xs text-gray-400">Value:</span>
                      <span className="font-mono text-gray-100 break-all whitespace-pre-wrap">
                        {s.is_secret
                          ? (revealed[s.key] ?? s.masked_value ?? '••••')
                          : (s.value || <span className="text-gray-500">—</span>)}
                      </span>
                    </div>
                    {s.description && (
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-xs text-gray-400">Description:</span>
                        <span className="text-gray-100 break-all">{s.description}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2 text-[11px] text-gray-400">
                      <span className="font-mono">Updated:</span>
                      <span className="text-gray-300">{timeAgo(s.updated_at)}</span>
                    </div>
</div>
                ))}
              </div>
             )
          }
        </Section>
    </div>
  );
};

const Env: BuiltinPageManifestEntry = { slug: 'env', name: 'Env', iconName: 'Env', iconSvg: '<rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />', component: InstanceEnv, };

export default Env;
