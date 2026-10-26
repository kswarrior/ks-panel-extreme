import React, { useEffect, useState } from 'react';
import { getModSettings, updateModSettings, extractApiErrorMessage } from '@/features/mods/api/mods';
import type { ModSettingDefinition, ModSettingView } from '@/shared/types/mod';
import GlassCard from '@/shared/components/ui/Card';

// ModSettingsCard renders the typed settings a v2 mod declared in its
// manifest (`settings: [...]`) and writes them back through
// GET/PUT /api/mods/{id}/settings (plan items M8 + D1).
//
// Scope: a setting declares global|instance|user|node. Global values need no
// id; every other bucket is addressed with "<type>:<id>". The card exposes a
// scope picker only when the manifest declares more than one bucket.
//
// Password settings are write-only: the API returns only is_set, so the field
// renders empty with an "unchanged" placeholder and submitting an empty value
// leaves the stored secret untouched.
interface ModSettingsCardProps {
  modId: number;
  definitions?: ModSettingDefinition[];
}

const inputClass =
  'block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40';

const scopesOf = (defs: ModSettingDefinition[]): string[] =>
  Array.from(new Set(defs.map((d) => d.scope || 'global')));

const ModSettingsCard: React.FC<ModSettingsCardProps> = ({ modId, definitions = [] }) => {
  const scopes = scopesOf(definitions);
  const [scopeType, setScopeType] = useState(scopes[0] || 'global');
  const [scopeIdDraft, setScopeIdDraft] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [settings, setSettings] = useState<ModSettingView[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');

  const scopeKey = scopeType === 'global' ? 'global' : `${scopeType}:${scopeId}`;

  useEffect(() => {
    let cancelled = false;
    if (!modId) return;
    if (scopeType !== 'global' && !scopeId) {
      setSettings([]);
      return;
    }
    getModSettings(modId, scopeKey)
      .then((r) => {
        if (cancelled) return;
        const list = r.settings || [];
        setSettings(list);
        const d: Record<string, string> = {};
        for (const s of list) {
          if (s.type === 'password') d[s.key] = '';
          else if (s.type === 'toggle') d[s.key] = s.value === 'true' ? 'true' : 'false';
          else d[s.key] = s.value ?? '';
        }
        setDraft(d);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(extractApiErrorMessage(e, 'Failed to load settings'));
        setSettings([]);
      });
    return () => { cancelled = true; };
  }, [modId, scopeKey, scopeType, scopeId]);

  if (definitions.length === 0 || !settings) return null;

  const setValue = (key: string, value: string) => {
    setDraft((p) => ({ ...p, [key]: value }));
    setSavedNote('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSavedNote('');
    try {
      const res = await updateModSettings(modId, draft, scopeKey);
      const list = res.settings || [];
      setSettings(list);
      const d: Record<string, string> = {};
      for (const s of list) {
        if (s.type === 'password') d[s.key] = '';
        else if (s.type === 'toggle') d[s.key] = s.value === 'true' ? 'true' : 'false';
        else d[s.key] = s.value ?? '';
      }
      setDraft(d);
      setSavedNote('Saved.');
    } catch (e: any) {
      setError(extractApiErrorMessage(e, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const needsScopeId = scopeType !== 'global';

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs uppercase tracking-wide text-gray-500">
          Settings · {scopeKey} · {settings.length}
        </h4>
        {savedNote && <span className="text-xs text-emerald-300">{savedNote}</span>}
      </div>
      {scopes.length > 1 && (
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <label className="text-xs text-gray-400">
            Scope
            <select
              value={scopeType}
              onChange={(e) => { setScopeType(e.target.value); setScopeId(''); setScopeIdDraft(''); }}
              className="block mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5"
            >
              {scopes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {needsScopeId && (
            <label className="text-xs text-gray-400">
              {scopeType} ID
              <div className="flex gap-1 mt-1">
                <input
                  value={scopeIdDraft}
                  onChange={(e) => setScopeIdDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setScopeId(scopeIdDraft.trim()); }}
                  className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5"
                  placeholder={scopeType === 'user' ? 'user id' : scopeType === 'instance' ? 'instance id' : 'node id'}
                />
                <button onClick={() => setScopeId(scopeIdDraft.trim())} className="px-2 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Load</button>
              </div>
            </label>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-300 mb-2">{error}</p>}
      {needsScopeId && !scopeId ? (
        <p className="text-sm text-gray-500">Enter a {scopeType} ID to edit this bucket.</p>
      ) : settings.length === 0 ? (
        <p className="text-sm text-gray-500">No {scopeType} settings declared for this mod.</p>
      ) : (
        <div className="space-y-3">
          {settings.map((s) => {
            const label = s.label || s.key;
            return (
              <div key={s.key}>
                <label className="text-sm text-gray-300" htmlFor={`mod-setting-${s.key}`}>
                  {label}
                  {s.type === 'password' && (
                    <span className={`ml-2 text-[10px] uppercase tracking-wide ${s.is_set ? 'text-emerald-300' : 'text-gray-500'}`}>
                      {s.is_set ? 'set' : 'not set'}
                    </span>
                  )}
                </label>
                {s.type === 'toggle' ? (
                  <label className="flex items-center gap-2 mt-1 text-sm text-gray-300">
                    <input
                      id={`mod-setting-${s.key}`}
                      type="checkbox"
                      checked={draft[s.key] === 'true'}
                      onChange={(e) => setValue(s.key, e.target.checked ? 'true' : 'false')}
                      className="accent-white"
                    />
                    <span>{draft[s.key] === 'true' ? 'On' : 'Off'}</span>
                  </label>
                ) : s.type === 'select' ? (
                  <select
                    id={`mod-setting-${s.key}`}
                    value={draft[s.key] ?? ''}
                    onChange={(e) => setValue(s.key, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">(unset)</option>
                    {(s.options || []).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`mod-setting-${s.key}`}
                    type={s.type === 'password' ? 'password' : s.type === 'number' ? 'number' : 'text'}
                    value={draft[s.key] ?? ''}
                    placeholder={
                      s.type === 'password'
                        ? s.is_set ? '•••••• (unchanged)' : 'not set'
                        : s.default ? `default: ${s.default}` : ''
                    }
                    autoComplete={s.type === 'password' ? 'new-password' : 'off'}
                    onChange={(e) => setValue(s.key, e.target.value)}
                    className={inputClass}
                  />
                )}
                {s.description && <p className="text-xs text-gray-500 mt-1">{s.description}</p>}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3">
        <button
          onClick={handleSave}
          disabled={saving || (needsScopeId && !scopeId)}
          className="px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </GlassCard>
  );
};

export default ModSettingsCard;
