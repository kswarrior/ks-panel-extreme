// InstanceSnapshotsTab — native snapshot UI for an instance.
// Lists driver-managed snapshots (create/restore/delete via edge),
// cron snapshot schedules, and panel-stored file-level tar backups with
// chunked resumable upload (Content-Range) + Range download. The legacy
// backups.json custom page keeps working — this is the native built-in
// (like Ports/SFTP) rendered at /instances/:id/snapshots.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  listSnapshotSchedules,
  createSnapshotSchedule,
  updateSnapshotSchedule,
  deleteSnapshotSchedule,
  listInstanceBackups,
  initInstanceBackup,
  uploadInstanceBackupChunk,
  downloadInstanceBackup,
  restoreInstanceBackup,
  deleteInstanceBackup,
} from '@/features/instances/api/instanceAdvanced';
import type { InstanceSnapshot } from '@/features/instances/types/instanceAdvanced';
import { formatBytes } from '@/features/database/utils/databaseUtils';
import { glassFieldClass } from '@/shared/components/ui/Field';

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export const InstanceSnapshotsTab: React.FC<{ instanceId: number }> = ({ instanceId }) => {
  const [snaps, setSnaps] = useState<InstanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof listSnapshotSchedules>>>([]);
  const [schedName, setSchedName] = useState('');
  const [schedCron, setSchedCron] = useState('0 3 * * *');

  const [files, setFiles] = useState<Awaited<ReturnType<typeof listInstanceBackups>>>([]);
  const [fileName, setFileName] = useState('backup.tar.gz');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, scheds, f] = await Promise.all([
        listSnapshots(instanceId).catch(() => [] as InstanceSnapshot[]),
        listSnapshotSchedules(instanceId).catch(() => []),
        listInstanceBackups(instanceId).catch(() => []),
      ]);
      setSnaps(s);
      setSchedules(scheds);
      setFiles(f);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const n = name.trim();
    if (!n) { setMsg({ tone: 'err', text: 'Enter a snapshot name.' }); return; }
    setBusy(n);
    setMsg(null);
    try {
      await createSnapshot(instanceId, { name: n });
      setMsg({ tone: 'ok', text: `Snapshot ${n} created.` });
      setName('');
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data?.error || e?.response?.data || e?.message || 'Create failed' });
    } finally { setBusy(null); }
  };

  const handleRestore = async (snap: string) => {
    if (!window.confirm(`Restore instance from snapshot "${snap}"? The container is stopped and recreated from the snapshot image (-p/volumes preserved on docker).`)) return;
    setBusy(snap);
    try {
      await restoreSnapshot(instanceId, snap);
      setMsg({ tone: 'ok', text: `Restored from ${snap}.` });
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data?.error || e?.response?.data || e?.message || 'Restore failed' });
    } finally { setBusy(null); }
  };

  const handleDelete = async (snap: string) => {
    if (!window.confirm(`Delete snapshot "${snap}"?`)) return;
    setBusy(snap);
    try {
      await deleteSnapshot(instanceId, snap);
      setMsg({ tone: 'ok', text: `Deleted ${snap}.` });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Delete failed' });
    } finally { setBusy(null); }
  };

  const handleCreateSchedule = async () => {
    if (!schedCron.trim()) { setMsg({ tone: 'err', text: 'Cron is required (5-field).' }); return; }
    try {
      await createSnapshotSchedule(instanceId, {
        name: schedName.trim() || 'nightly', cron: schedCron.trim(), enabled: true,
        keep_last_n: 7, max_age_days: 30, compression: 'none', s3_push: false,
      });
      setMsg({ tone: 'ok', text: 'Snapshot schedule created.' });
      setSchedName('');
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Schedule failed' });
    }
  };

  const handleToggleSchedule = async (s: (typeof schedules)[number]) => {
    try {
      await updateSnapshotSchedule(instanceId, s.id, {
        name: s.name, cron: s.cron, enabled: !s.enabled,
        keep_last_n: s.keep_last_n, max_age_days: s.max_age_days,
        compression: s.compression, s3_push: s.s3_push,
      });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Toggle failed' });
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!window.confirm('Delete this snapshot schedule?')) return;
    try {
      await deleteSnapshotSchedule(instanceId, id);
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Delete failed' });
    }
  };

  const handleFileUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setMsg({ tone: 'err', text: 'Choose a .tar file first.' }); return; }
    setUploading(true);
    setProgress(0);
    setMsg(null);
    try {
      const init = await initInstanceBackup(instanceId, { filename: fileName.trim() || f.name, compression: 'none' });
      const CHUNK = 4 << 20; // 4 MiB chunks with Content-Range resume
      let offset = 0;
      const total = f.size;
      while (offset < total) {
        const slice = f.slice(offset, Math.min(offset + CHUNK, total));
        const r = await uploadInstanceBackupChunk(instanceId, init.id, slice, offset, total);
        offset = r.offset;
        setProgress(Math.round((offset / total) * 100));
        if (r.complete) break;
      }
      setMsg({ tone: 'ok', text: `Uploaded ${init.filename} (${formatBytes(total)}).` });
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e: any) {
      const serverOffset = e?.response?.headers?.['x-expected-offset'];
      setMsg({ tone: 'err', text: (e?.response?.data || e?.message || 'Upload failed') + (serverOffset ? ` (server at ${serverOffset})` : '') });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFileDownload = async (id: number, filename: string) => {
    try {
      const blob = await downloadInstanceBackup(instanceId, id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Download failed' });
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-md p-2 text-sm border ${msg.tone === 'ok' ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-200' : 'bg-red-900/20 border-red-700/40 text-red-200'}`}>
          {msg.text}
        </div>
      )}
      <div className="glass-card ks-form-card rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Snapshots (driver)</h3>
          <span className="text-xs text-gray-500">{snaps.length} saved</span>
          <button onClick={load} className="ml-auto text-gray-400 hover:text-white text-xs">Refresh</button>
        </div>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} placeholder="snap-name" maxLength={64} className={glassFieldClass + ' font-mono text-sm flex-1'} />
          <button onClick={handleCreate} disabled={!!busy} className="ks-primary-btn px-4 py-1.5 rounded-md text-sm disabled:opacity-40">Create</button>
        </div>
        {loading ? <div className="text-sm text-gray-500">Loading…</div> : snaps.length === 0 ? (
          <p className="text-xs text-gray-500">No snapshots yet. Docker uses <code className="font-mono">commit</code>; restore stops + recreates with -p/volumes preserved.</p>
        ) : (
          <div className="space-y-1">
            {snaps.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs border border-white/10 rounded-md px-2 py-1.5">
                <span className="font-mono text-gray-200">{s.name}</span>
                <span className="text-gray-500">{s.size_bytes ? formatBytes(s.size_bytes) : ''} {fmtDate(s.created_at)}</span>
                <span className="ml-auto flex gap-1">
                  <button onClick={() => handleRestore(s.name)} disabled={busy === s.name} className="px-2 py-0.5 rounded bg-amber-700/30 border border-amber-700/40 text-amber-200">Restore</button>
                  <button onClick={() => handleDelete(s.name)} disabled={busy === s.name} className="px-2 py-0.5 rounded border border-red-700/40 text-red-200">Delete</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card ks-form-card rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-white">Snapshot schedules (cron)</h4>
        <div className="flex gap-2 flex-wrap">
          <input value={schedName} onChange={(e) => setSchedName(e.target.value)} placeholder="nightly" className={glassFieldClass + ' font-mono text-sm'} />
          <input value={schedCron} onChange={(e) => setSchedCron(e.target.value)} placeholder="0 3 * * *" title="5-field cron" className={glassFieldClass + ' font-mono text-sm'} />
          <button onClick={handleCreateSchedule} className="ks-primary-btn px-4 py-1.5 rounded-md text-sm">Add</button>
        </div>
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-xs border border-white/10 rounded-md px-2 py-1.5">
            <span className="font-mono">{s.name}</span>
            <span className="font-mono text-gray-500">{s.cron}</span>
            <span className={s.enabled ? 'text-emerald-300' : 'text-gray-500'}>{s.enabled ? 'on' : 'off'}</span>
            <span className="ml-auto flex gap-1">
              <button onClick={() => handleToggleSchedule(s)} className="px-2 py-0.5 rounded border border-white/10">Toggle</button>
              <button onClick={() => handleDeleteSchedule(s.id)} className="px-2 py-0.5 rounded border border-red-700/40 text-red-200">Delete</button>
            </span>
          </div>
        ))}
      </div>

      <div className="glass-card ks-form-card rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-white">File-level tar backups (chunked, resumable)</h4>
        <p className="text-xs text-gray-400">Panel-stored tars with <code className="font-mono">Content-Range</code> resume on upload and <code className="font-mono">Range</code> resume on download.</p>
        <div className="flex gap-2 flex-wrap">
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} className={glassFieldClass + ' font-mono text-sm'} />
          <input ref={fileRef} type="file" accept=".tar,.tar.gz,.tgz,.tar.zst,.db,.db.gz" disabled={uploading} className="block text-sm text-gray-300" />
          <button onClick={handleFileUpload} disabled={uploading} className="ks-primary-btn px-4 py-1.5 rounded-md text-sm disabled:opacity-40">
            {uploading ? `Uploading ${progress}%…` : 'Upload'}
          </button>
        </div>
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2 text-xs border border-white/10 rounded-md px-2 py-1.5">
            <span className="font-mono text-gray-200">{f.filename}</span>
            <span className="text-gray-500">{formatBytes(f.size_bytes)} {fmtDate(f.created_at)}</span>
            <span className="ml-auto flex gap-1">
              <button onClick={() => handleFileDownload(f.id, f.filename)} className="px-2 py-0.5 rounded bg-sky-900/30 border border-sky-700/40 text-sky-200">Download</button>
              <button onClick={async () => { await restoreInstanceBackup(instanceId, f.id); setMsg({ tone: 'ok', text: 'Marked restored — download + replay via Files.' }); }} className="px-2 py-0.5 rounded bg-amber-700/30 border border-amber-700/40 text-amber-200">Restore</button>
              <button onClick={async () => { if (window.confirm('Delete?')) { await deleteInstanceBackup(instanceId, f.id); await load(); } }} className="px-2 py-0.5 rounded border border-red-700/40 text-red-200">Delete</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InstanceSnapshotsTab;
