import React, { useCallback, useEffect, useState } from 'react';
import {
  listPanelUpdateWindows,
  createPanelUpdateWindow,
  updatePanelUpdateWindow,
  deletePanelUpdateWindow,
  listFleetUpdateWindows,
  createFleetUpdateWindow,
  updateFleetUpdateWindow,
  deleteFleetUpdateWindow,
} from '@/shared/api/admin';
import type { UpdateWindow, UpdateWindowTarget, UpdateWindowUpsert } from '@/features/nodes/types/node';

interface UpdateWindowsCardProps {
  target: UpdateWindowTarget;
  title: string;
  description: string;
}

const EMPTY_FORM: UpdateWindowUpsert = {
  name: '',
  cron: '0 3 * * *',
  enabled: true,
  window_start: '02:00',
  window_end: '04:00',
};

function apiFor(target: UpdateWindowTarget) {
  if (target === 'panel') {
    return {
      list: listPanelUpdateWindows,
      create: createPanelUpdateWindow,
      update: updatePanelUpdateWindow,
      remove: deletePanelUpdateWindow,
    };
  }
  return {
    list: listFleetUpdateWindows,
    create: createFleetUpdateWindow,
    update: updateFleetUpdateWindow,
    remove: deleteFleetUpdateWindow,
  };
}

const UpdateWindowsCard: React.FC<UpdateWindowsCardProps> = ({ target, title, description }) => {
  const api = apiFor(target);
  const [windows, setWindows] = useState<UpdateWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UpdateWindow | null>(null);
  const [form, setForm] = useState<UpdateWindowUpsert>(EMPTY_FORM);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setWindows(await api.list());
    } catch (e: any) {
      setErr(e?.response?.data || e?.message || 'Failed to load update windows');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErr('');
    setFormOpen(true);
  };

  const openEdit = (w: UpdateWindow) => {
    setEditing(w);
    setForm({
      name: w.name,
      cron: w.cron,
      enabled: w.enabled,
      window_start: w.window_start || '',
      window_end: w.window_end || '',
    });
    setFormErr('');
    setFormOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormErr('');
    try {
      if (editing) {
        await api.update(editing.id, form);
      } else {
        await api.create(form);
      }
      setFormOpen(false);
      await reload();
    } catch (e: any) {
      setFormErr(typeof e?.response?.data === 'string' && e.response.data.trim()
        ? e.response.data
        : (e?.message || 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (w: UpdateWindow) => {
    if (!window.confirm(`Delete update window "${w.name}"?`)) return;
    try {
      await api.remove(w.id);
      await reload();
    } catch (e: any) {
      alert(typeof e?.response?.data === 'string' && e.response.data.trim()
        ? e.response.data
        : (e?.message || 'Delete failed'));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-1 h-5 rounded bg-violet-400" />
          {title}
        </h3>
        <button
          onClick={openCreate}
          className="ks-primary-btn inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm"
        >
          New schedule
        </button>
      </div>
      <p className="text-xs text-gray-500">{description}</p>

      {loading && <div className="glass-card rounded-xl animate-pulse h-16" />}
      {!loading && err && <p className="text-red-400 text-sm">{err}</p>}
      {!loading && !err && windows.length === 0 && (
        <p className="text-sm text-gray-500">
          No schedules yet — updates only run when you trigger them manually.
        </p>
      )}
      {!loading && !err && windows.length > 0 && (
        <div className="space-y-1.5">
          {windows.map((w) => (
            <div key={w.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${w.enabled ? 'bg-emerald-400' : 'bg-gray-600'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">
                  {w.name}
                  <span className="ml-2 text-[11px] text-gray-500 font-mono">{w.cron}</span>
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                  window {w.window_start || '—'}–{w.window_end || '—'} UTC
                  {w.next_run_at ? ` · next ${new Date(w.next_run_at).toLocaleString()}` : ' · not armed'}
                  {w.last_status ? ` · last: ${w.last_status}` : ''}
                </div>
              </div>
              <button
                onClick={() => openEdit(w)}
                className="px-2 py-1 text-xs rounded border border-white/10 text-gray-200 hover:bg-white/10"
              >
                Edit
              </button>
              <button
                onClick={() => remove(w)}
                className="px-2 py-1 text-xs rounded border border-red-400/30 text-red-300 hover:bg-red-400/10"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="nightly"
                className="w-full glass-field text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Cron (5-field)</span>
              <input
                value={form.cron}
                onChange={(e) => setForm({ ...form, cron: e.target.value })}
                placeholder="0 3 * * *"
                className="w-full glass-field text-sm font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Window start (HH:MM UTC)</span>
              <input
                value={form.window_start}
                onChange={(e) => setForm({ ...form, window_start: e.target.value })}
                placeholder="02:00 (empty = unbounded)"
                className="w-full glass-field text-sm font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Window end (HH:MM UTC)</span>
              <input
                value={form.window_end}
                onChange={(e) => setForm({ ...form, window_end: e.target.value })}
                placeholder="04:00 (empty = unbounded)"
                className="w-full glass-field text-sm font-mono"
              />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-xs text-gray-300">Enabled</span>
          </label>
          {formErr && <p className="text-red-400 text-sm">{formErr}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setFormOpen(false)}
              className="ks-ghost-btn px-3 py-1.5 rounded text-sm"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="ks-primary-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default UpdateWindowsCard;
