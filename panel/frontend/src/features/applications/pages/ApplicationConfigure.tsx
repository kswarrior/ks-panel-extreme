import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  listApplications,
  updateApplication,
  type Application,
  type ApplicationConfigField,
} from '@/features/applications/api/applications';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import GlassField from '@/shared/components/ui/Field';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

type ConfigField = ApplicationConfigField & { options?: Array<{ value: string; label: string }> };

const ApplicationConfigure: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const apps = await listApplications();
        if (cancelled) return;
        const a = apps.find((x) => x.id === Number(id));
        if (a) {
          setApp(a);
          setFields(
            Array.isArray(a.config_schema) && a.config_schema
              ? a.config_schema.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined }))
              : []
          );
        } else {
          setError('Application not found');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const updateField = (idx: number, patch: Partial<ConfigField>) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { key: '', label: '', type: 'text', required: false, placeholder: '', description: '' },
    ]);
  };

  const removeField = (idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!app) return;

    // Light validation: keys must be unique + non-empty when the field
    // itself has a label (a field with neither key nor label is treated
    // as an accidental blank row and pruned before save).
    const seen = new Set<string>();
    for (const f of fields) {
      if (!f.label && !f.key) continue;
      const key = (f.key || '').trim();
      if (!key) {
        setError(`Field "${f.label}" is missing a key (the internal name, e.g. bot_token).`);
        return;
      }
      if (seen.has(key)) {
        setError(`Duplicate field key "${key}" — keys must be unique.`);
        return;
      }
      seen.add(key);
    }

    const cleaned = fields
      .filter((f) => f.label || f.key)
      .map((f) => ({
        ...f,
        key: f.key.trim(),
        label: f.label.trim(),
        placeholder: f.placeholder?.trim() || '',
        description: f.description?.trim() || '',
        default: f.default === '' ? undefined : f.default,
          options: f.options?.length
            ? f.options.map((o: { value: string; label: string }) => ({ value: o.value.trim(), label: o.label.trim() || o.value.trim() }))
            : undefined,
        required: !!f.required,
      }));

    setSaving(true);
    setError('');
    try {
      await updateApplication(app.id, {
        name: app.name,
        category: app.category,
        version: app.version,
        description: app.description,
        icon: app.icon,
        runtime: app.runtime,
        entrypoint: app.entrypoint,
        config_schema: cleaned,
      });
      navigate('/applications');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <FormPage
        crumbs={[
          { label: 'Applications', to: '/applications' },
          { label: 'Configure Application' },
        ]}
        hideHeader
        maxWidth="max-w-3xl"
      >
        <FormSkeleton fields={4} />
      </FormPage>
    );
  }

  if (!app) {
    return (
      <FormPage
        crumbs={[
          { label: 'Applications', to: '/applications' },
          { label: 'Configure Application' },
        ]}
        hideHeader
        maxWidth="max-w-3xl"
      >
        <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-sm px-3 py-2 rounded">
          {error || 'Application not found'}
        </div>
      </FormPage>
    );
  }

  const crumbs = [
    { label: 'Applications', to: '/applications' },
    { label: `Configure — ${app.name}` },
  ];

  return (
    <>
      {/* Top-right actions — fixed, auto-hide on scroll (node pattern).
          Footer Cancel/Save removed; everything lives here. */}
      <PageActionsPill>
          <button
            type="button"
            onClick={() => navigate('/applications')}
            title="Cancel and back to Applications"
            aria-label="Cancel and back to Applications"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={saving}
            title="Save fields"
            className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {saving ? 'Saving…' : 'Save fields'}
          </button>
      </PageActionsPill>
    <FormPage
      crumbs={crumbs}
      onSubmit={submit}
      maxWidth="max-w-3xl"
      hideHeader
    >
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs text-gray-400">
          These are the fields a user fills in when installing this bot (e.g.{' '}
          <span className="text-gray-200">Bot Token</span>,{' '}
          <span className="text-gray-200">Client ID</span>).
          Secret fields are masked + stored encrypted on the installation row;
          text / number / select / textarea land as plain values.
        </p>

        {fields.length === 0 && (
          <div className="ks-card ks-form-card border-dashed rounded-lg p-6 text-center">
            <p className="text-sm text-gray-400">
              No fields yet. Click "<span className="text-white">+ Add field</span>" to define what the
              user must supply to install this application.
            </p>
          </div>
        )}

        {fields.map((f, idx) => (
          <div key={idx} className="ks-card ks-form-card rounded-lg space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Field #{idx + 1}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveField(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
                  aria-label="Move field up"
                  title="Move up"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <polyline points="18 15 12 9 6 15" />
                   </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveField(idx, 1)}
                  disabled={idx === fields.length - 1}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
                  aria-label="Move field down"
                  title="Move down"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <polyline points="6 9 12 15 18 9" />
                   </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeField(idx)}
                  className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-900/30"
                  aria-label="Remove field"
                  title="Remove field"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                   </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <GlassField label="Key (internal name)">
                <input
                  value={f.key}
                  onChange={(e) => updateField(idx, { key: e.target.value })}
                  placeholder="bot_token"
                  className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5 font-mono focus:outline-none focus:border-white/40"
                />
              </GlassField>
              <GlassField label="Label (shown to user)">
                <input
                  value={f.label}
                  onChange={(e) => updateField(idx, { label: e.target.value })}
                  placeholder="Bot Token"
                  className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5 focus:outline-none focus:border-white/40"
                />
              </GlassField>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <GlassField label="Type">
                <select
                  value={f.type}
                  onChange={(e) => updateField(idx, { type: e.target.value as ConfigField['type'] })}
                  className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5 focus:outline-none focus:border-white/40"
                >
                  <option value="text">Text</option>
                  <option value="secret">Secret (masked)</option>
                  <option value="number">Number</option>
                  <option value="select">Select (dropdown)</option>
                  <option value="textarea">Textarea</option>
                </select>
              </GlassField>
              <GlassField label="Default value">
                <input
                  value={f.default !== undefined ? String(f.default) : ''}
                  onChange={(e) => updateField(idx, { default: e.target.value })}
                  placeholder="(none)"
                  className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5 focus:outline-none focus:border-white/40"
                />
              </GlassField>
              <GlassField label="Placeholder">
                <input
                  value={f.placeholder || ''}
                  onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                  placeholder="(optional)"
                  className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5 focus:outline-none focus:border-white/40"
                />
              </GlassField>
            </div>

            <GlassField label="Description / helper text">
              <input
                value={f.description || ''}
                onChange={(e) => updateField(idx, { description: e.target.value })}
                placeholder="Shown as small helper text under the field."
                className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5 focus:outline-none focus:border-white/40"
              />
            </GlassField>

              {f.type === 'select' && (
                <GlassField label="Options (one per line: value|Label)">
                  <textarea
                    value={(f.options || []).map((o: { value: string; label: string }) => `${o.value}|${o.label}`).join('\n')}
                    onChange={(e) => {
                      const opts = e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                          const [val, ...rest] = line.split('|');
                          return { value: val.trim(), label: rest.join('|').trim() || val.trim() };
                        });
                      updateField(idx, { options: opts });
                    }}
                  rows={3}
                  placeholder={'dev|Development\nprod|Production'}
                  className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-2 py-1.5 font-mono focus:outline-none focus:border-white/40"
                />
              </GlassField>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!f.required}
                onChange={(e) => updateField(idx, { required: e.target.checked })}
                className="w-3.5 h-3.5 accent-sky-500"
              />
              <span className="text-xs text-gray-300">Required (user must fill this in before installing)</span>
            </label>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={addField}
          className="px-4 py-2 text-sm rounded border border-white/10 text-white hover:bg-white/10"
        >
          + Add field
        </button>
      </div>
    </FormPage>
    </>
  );
};

export default ApplicationConfigure;