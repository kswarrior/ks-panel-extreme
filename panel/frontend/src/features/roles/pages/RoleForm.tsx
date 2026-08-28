import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createRole, listAuthProviders, listPermissions, listRoles, updateRole } from '@/shared/api/admin';
import type { Role, Permission } from '@/shared/types/user';
import type { AuthProviderInfo } from '@/features/authority/types/authority';
import FormPage from '@/shared/components/forms/FormPage';
import RoleIdentity from '@/features/roles/components/RoleIdentity';
import RolePermissions from '@/features/roles/components/RolePermissions';
import RoleAuthorities from '@/features/roles/components/RoleAuthorities';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

interface Form {
  name: string;
  display_name: string;
  color: string;
  description: string;
  icon: string;
  permissions: string[];
  allowed_auth_types: string[] | null;
}

const ROLE_TABS: { id: 'identity' | 'permissions' | 'authorities'; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'authorities', label: 'Authorities' },
];

const RoleForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const editing = !!id;
  const navigate = useNavigate();

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [authProviders, setAuthProviders] = useState<AuthProviderInfo[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [form, setForm] = useState<Form>({ name: '', display_name: '', color: '', description: '', icon: '', permissions: [], allowed_auth_types: null });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'identity' | 'permissions' | 'authorities'>('identity');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [perms, providers, roles] = await Promise.all([
          listPermissions(),
          listAuthProviders(),
          listRoles(),
        ]);
        if (cancelled) return;
        setPermissions(perms);
        setAuthProviders(providers);
        if (editing) {
          const r = roles.find((x) => x.id === Number(id));
          if (r) {
            setRole(r);
            setForm({
              name: r.name,
              display_name: r.display_name || '',
              color: r.color || '',
              description: r.description,
              icon: r.icon || '',
              permissions: r.permissions || [],
              allowed_auth_types:
                Array.isArray(r.allowed_auth_types) ? [...r.allowed_auth_types] : null,
            });
          } else {
            setError('Role not found');
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
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        display_name: form.display_name.trim(),
        color: form.color,
        description: form.description,
        icon: form.icon,
        permissions: form.permissions,
        allowed_auth_types: form.allowed_auth_types,
      };
      if (editing && role) {
        await updateRole(role.id, payload);
      } else {
        await createRole(payload);
      }
      navigate('/roles');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Roles', to: '/roles' }, { label: editing ? 'Edit Role' : 'New Role' }]}
        saving={false}
        submitLabel="Save"
      >
        <FormSkeleton fields={4} />
      </FormPage>
    );
  }

  return (
    <FormPage
      crumbs={[{ label: 'Roles', to: '/roles' }, { label: editing && role ? role.name : 'New Role' }]}
      saving={saving}
      submitLabel="Save"
      onSubmit={submit}
    >
      <div className="space-y-4">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-neutral-900/60 border border-white/10 p-1">
          {ROLE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`ks-tab transition-colors ${
                tab === t.id ? 'ks-tab-active' : ''
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'identity' && (
          <RoleIdentity
            form={{ name: form.name, display_name: form.display_name, color: form.color, description: form.description, icon: form.icon }}
            setForm={(newForm) => setForm({ ...form, ...newForm })}
          />
        )}

        {tab === 'permissions' && (
          <RolePermissions
            formPermissions={form.permissions}
            setFormPermissions={(permsOrUpdater) => setForm(prev => {
              const perms = typeof permsOrUpdater === 'function'
                ? (permsOrUpdater as (p: string[]) => string[])(prev.permissions)
                : permsOrUpdater;
              return { ...prev, permissions: perms };
            })}
            permissions={permissions}
          />
        )}

        {tab === 'authorities' && (
          <RoleAuthorities
            formAllowedAuthTypes={form.allowed_auth_types}
            setFormAllowedAuthTypes={(newVal) => setForm({ ...form, allowed_auth_types: newVal })}
            authProviders={authProviders}
          />
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </FormPage>
  );
};

export default RoleForm;