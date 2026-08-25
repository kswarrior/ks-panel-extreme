import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  listApplications,
  createApplication,
  updateApplication,
  type Application,
  type ApplicationConfigField,
  type ApplicationPermissionReq,
} from '@/features/applications/api/applications';
import {
  appCategoryMeta,
  appRuntimeMeta,
  ApplicationCapability,
} from '@/features/applications/types/application';
import FormPage from '@/shared/components/forms/FormPage';
import GlassField from '@/shared/components/ui/Field';

type Form = {
  name: string;
  slug: string;
  category: string;
  version: string;
  description: string;
  icon: string;
  runtime: string;
  entrypoint: string;
  config_schema: ApplicationConfigField[];
  permissionsRequested: ApplicationPermissionReq[];
};

const ApplicationEdit: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const editing = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>({
    name: '',
    slug: '',
    category: 'custom',
    version: '1.0.0',
    description: '',
    icon: '',
    runtime: 'nodejs',
    entrypoint: '',
    config_schema: [],
    permissionsRequested: [],
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Raw text of the config-schema editor. Kept separate from `form` so
  // intermediate keystrokes that aren't valid JSON yet aren't silently
  // reverted by a controlled re-stringify; parsed + validated on submit.
  const [schemaDraft, setSchemaDraft] = useState('[]');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (editing) {
          const apps = await listApplications();
          if (cancelled) return;
          const a = apps.find((x) => x.id === Number(id));
          if (a) {
            setForm({
              name: a.name,
              slug: a.slug,
              category: a.category,
              version: a.version,
              description: a.description,
              icon: a.icon,
              runtime: a.runtime,
              entrypoint: a.entrypoint,
              config_schema: Array.isArray(a.config_schema) ? a.config_schema : [],
              permissionsRequested: Array.isArray(a.permissions) ? a.permissions.map(p => ({ capability: p.capability, access_level: p.access_level })) : [],
            });
          } else {
            setError('Application not found');
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, editing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!form.slug.trim()) {
      setError('Slug is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        category: form.category,
        version: form.version,
        description: form.description,
        icon: form.icon,
        runtime: form.runtime,
        entrypoint: form.entrypoint,
        config_schema: form.config_schema,
        permissionsRequested: form.permissionsRequested,
      };
      if (editing) {
        await updateApplication(Number(id), payload);
      } else {
        await createApplication(payload);
      }
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
          { label: editing ? 'Edit Application' : 'New Application' },
        ]}
        saving={true}
        submitLabel="Save"
      >
        <div className="text-gray-400 text-sm">Loading…</div>
      </FormPage>
    );
  }

  const crumbs = [
    { label: 'Applications', to: '/applications' },
    { label: editing ? `Edit — ${form.name}` : 'New Application' },
  ];

  return (
    <FormPage
      crumbs={crumbs}
      saving={saving}
      submitLabel="Save"
      submittingLabel="Saving…"
      onSubmit={submit}
      maxWidth="max-w-3xl"
    >
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      <GlassField label="Name">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40"
          placeholder="Discord Bot"
          required
        />
      </GlassField>

      <GlassField label="Slug (URL-safe ID)" hint="Auto-generated from name; used in URLs and as unique key.">
        <input
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') })}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
          placeholder="discord-bot"
          required
        />
      </GlassField>

      <GlassField label="Category">
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40"
        >
          {['discord', 'whatsapp', 'telegram', 'slack', 'custom'].map((c) => (
            <option key={c} value={c}>{appCategoryMeta(c)?.label || c}</option>
          ))}
        </select>
      </GlassField>

      <GlassField label="Version">
        <input
          value={form.version}
          onChange={(e) => setForm({ ...form, version: e.target.value })}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40"
          placeholder="1.0.0"
        />
      </GlassField>

      <GlassField label="Description">
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40"
        />
      </GlassField>

      <GlassField label="Icon (emoji)">
        <input
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          maxLength={4}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40"
          placeholder="🤖"
        />
      </GlassField>

      <GlassField label="Runtime">
        <select
          value={form.runtime}
          onChange={(e) => setForm({ ...form, runtime: e.target.value })}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40"
        >
          {['nodejs', 'python', 'bash', 'custom'].map((r) => (
            <option key={r} value={r}>{appRuntimeMeta(r)?.label || r}</option>
          ))}
        </select>
      </GlassField>

      <GlassField label="Entrypoint (script path or command)">
        <input
          value={form.entrypoint}
          onChange={(e) => setForm({ ...form, entrypoint: e.target.value })}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
          placeholder="src/bot.js"
        />
      </GlassField>

      <GlassField label="Requested Permissions">
        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            Capabilities this application needs. The admin must approve each one before activation.
          </p>
          {Object.values(ApplicationCapability).map((cap) => (
            <label
              key={cap}
              className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-white/10 bg-black/20 hover:bg-white/[0.04]"
            >
              <input
                type="checkbox"
                checked={form.permissionsRequested.some(p => p.capability === cap)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setForm({
                      ...form,
                      permissionsRequested: [
                        ...form.permissionsRequested,
                        { capability: cap, access_level: 'standard' },
                      ],
                    });
                  } else {
                    setForm({
                      ...form,
                      permissionsRequested: form.permissionsRequested.filter(p => p.capability !== cap),
                    });
                  }
                }}
                className="w-4 h-4 accent-sky-500"
              />
              <span className="text-sm text-white capitalize">{cap.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      </GlassField>

      <GlassField label="Config Schema (JSON array of field definitions)">
        <textarea
          value={JSON.stringify(form.config_schema, null, 2)}
          onChange={(e) => {
            try {
              setForm({ ...form, config_schema: JSON.parse(e.target.value) });
            } catch {
              /* ignore invalid JSON while typing */
            }
          }}
          rows={8}
          className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
          placeholder='[{"key":"bot_token","label":"Bot Token","type":"secret","required":true}]'
        />
      </GlassField>

      <p className="text-[11px] text-gray-500">
        Requested permissions are fixed at upload — re-upload the application to change what it asks for.
      </p>
    </FormPage>
  );
};

export default ApplicationEdit;