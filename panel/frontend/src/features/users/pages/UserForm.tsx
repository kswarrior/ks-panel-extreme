import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createUser, listRoles, updateUser, listUsers } from '@/shared/api/admin';
import type { User, Role } from '@/shared/types/user';
import GlassCard from '@/shared/components/ui/Card';
import GlassField, { glassFieldClass } from '@/shared/components/ui/Field';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

type Form = {
  username: string;
  email: string;
  password: string;
  role_id: number;
};

const UserForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const editing = !!id;
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<Form>({ username: '', email: '', password: '', role_id: 0 });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rs = await listRoles();
        if (cancelled) return;
        setRoles(rs);
        if (editing) {
          const users = await listUsers();
          if (cancelled) return;
          const u = users.find((x) => x.id === Number(id));
          if (u) {
            setEditingUser(u);
            setForm({ username: u.username, email: u.email, password: '', role_id: u.role_id });
          } else {
            setError('User not found');
          }
        } else {
          setForm({ username: '', email: '', password: '', role_id: rs[0]?.id || 0 });
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
    if (!form.username.trim() || !form.email.trim() || !form.role_id) {
      setError('Username, email and role are required');
      return;
    }
    if (!editing && form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing && editingUser) {
        await updateUser(editingUser.id, {
          username: form.username,
          email: form.email,
          role_id: form.role_id,
          password: form.password || undefined,
        });
      } else {
        await createUser(form);
      }
      navigate('/users');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Users', to: '/users' }, { label: editing ? 'Edit User' : 'New User' }]}
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
            onClick={() => navigate('/users')}
            title="Cancel and back to Users"
            aria-label="Cancel and back to Users"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={saving}
            title={editing ? 'Save user' : 'Create user'}
            className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
      </PageActionsPill>
    <FormPage
      crumbs={[{ label: 'Users', to: '/users' }, { label: editing ? 'Edit User' : 'New User' }]}
      onSubmit={submit}
      hideHeader
    >
      <GlassCard variant="form">
      <div className="space-y-4">
        <GlassField label="Username" htmlFor="username">
          <input
            id="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </GlassField>
        <GlassField label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </GlassField>
        <GlassField
          label={editing ? 'Password (leave blank to keep current)' : 'Password'}
          htmlFor="password"
        >
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={editing ? '••••••••' : ''}
            required={!editing}
          />
        </GlassField>
        <GlassField label="Role" htmlFor="role">
          <select
            id="role"
            value={form.role_id}
            onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}
            required
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </GlassField>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
      </GlassCard>
    </FormPage>
    </>
  );
};

export default UserForm;