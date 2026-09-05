import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createRole, listAuthProviders, listPermissions, listRoles, updateRole } from '@/shared/api/admin';
import type { Role, Permission } from '@/shared/types/user';
import type { AuthProviderInfo } from '@/features/authority/types/authority';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageTabsPill from '@/shared/components/ui/PageTabsPill';
import GlassCard from '@/shared/components/ui/Card';
import RoleIdentity from '@/features/roles/components/RoleIdentity';
import RolePermissions from '@/features/roles/components/RolePermissions';
import RoleAuthorities from '@/features/roles/components/RoleAuthorities';
import { AUTHORITY_PROVIDER } from '@/features/authority/types/authority';
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

// Node-pattern tab meta: desktop hint + icon.
const ROLE_TAB_META: Record<string, { hint: string; icon: React.ReactNode }> = {
  identity: {
    hint: 'Name, display & colour',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>,
  },
  permissions: {
    hint: 'Granted permissions',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  },
  authorities: {
    hint: 'Allowed auth types',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  },
};

const ALLOWED_AUTH_TYPES_UNRESTRICTED: string[] = [];

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

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Backend sanitizeAllowedAuthTypes collapses an explicit [] to nil
      // (unrestricted), so a "password-only" restriction would silently
      // become "allow everything". Send ["password"] instead — password is
      // always implicitly allowed and survives the admin-enabled filter,
      // persisting as a restricted single-entry list.
      const allowed = form.allowed_auth_types;
      const payload = {
        name: form.name,
        display_name: form.display_name.trim(),
        color: form.color,
        description: form.description,
        icon: form.icon,
        permissions: form.permissions,
        allowed_auth_types:
          allowed !== null && allowed.length === 0
            ? [AUTHORITY_PROVIDER.password]
            : allowed,
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
        hideHeader
      >
        <FormSkeleton fields={4} />
      </FormPage>
    );
  }

  return (
    <>
      {/* Top-right actions — Cancel + Save live here; the footer bar is removed. */}
      <PageActionsPill>
          <button
            type="button"
            onClick={() => navigate('/roles')}
            title="Cancel and back to Roles"
            aria-label="Cancel and back to Roles"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={saving}
            title={editing ? 'Save role' : 'Create role'}
            className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
      </PageActionsPill>
    <FormPage
      crumbs={[{ label: 'Roles', to: '/roles' }, { label: editing ? 'Edit Role' : 'New Role' }]}
      onSubmit={submit}
      maxWidth="max-w-4xl"
      hideHeader
    >
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* Desktop tabs — vertical on the left (node pattern). */}
        <GlassCard className="hidden lg:block lg:sticky lg:top-4 self-start">
          <nav aria-label="Role form sections" className="flex lg:flex-col gap-1">
            {ROLE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`ks-tab w-full flex items-center gap-2 transition text-left ${
                  tab === t.id ? 'ks-tab-active' : ''
                }`}
              >
                <span className="inline-flex items-center shrink-0">{ROLE_TAB_META[t.id].icon}</span>
                <span className="flex flex-col min-w-0">
                  <span>{t.label}</span>
                  <span
                    className={`text-[10px] hidden lg:block ${tab === t.id ? 'opacity-70' : 'text-gray-500'}`}
                    style={tab === t.id ? { color: 'var(--ks-tab-active-text, #000000)' } : undefined}
                  >
                    {ROLE_TAB_META[t.id].hint}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </GlassCard>
        <div className="space-y-4 min-w-0">

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
      </div>
      {/* Phone tabs — bottom pill with the same `>` / `<` toggle + auto-off
          system as the actions pill (PageTabsPill). */}
      <PageTabsPill ariaLabel="Role form sections" spacer={false} activeLabel={ROLE_TABS.find((t) => t.id === tab)?.label}>
        {ROLE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`ks-tab shrink-0 flex-1 px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5 ${tab === t.id ? 'ks-tab-active' : ''}`}
          >
            <span className="inline-flex items-center shrink-0">{ROLE_TAB_META[t.id].icon}</span>
            {t.label}
          </button>
        ))}
      </PageTabsPill>
    </FormPage>
    {/* Spacer — reserves scroll room so the fixed bottom pill never
        covers trailing form content (node pattern). */}
    <div aria-hidden="true" className="h-24 lg:hidden" />
    </>
  );
};

export default RoleForm;