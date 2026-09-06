// Database Backup tab — named snapshots of the panel database.
// Top-right Create / Upload buttons open sub-page modals (file + URL).
// Schedules drive cron VACUUM INTO / native dumps + retention prune +
// optional S3 push; the S3 remote is SigV4 path-style (secret never shown).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  listDatabaseBackups,
  createDatabaseBackup,
  downloadDatabaseBackup,
  uploadDatabaseBackup,
  uploadDatabaseBackupByURL,
  restoreDatabaseBackup,
  deleteDatabaseBackup,
  listDBBackupSchedules,
  createDBBackupSchedule,
  updateDBBackupSchedule,
  deleteDBBackupSchedule,
  pruneDBBackups,
  getBackupS3Config,
  putBackupS3Config,
  pushDBBackupToS3,
  pullDBBackupFromS3,
} from '@/shared/api/admin';
import type { BackupSchedule, DatabaseBackup, S3ConfigView } from '../types/database';
import { formatBytes } from '../utils/databaseUtils';
import { glassFieldClass } from '@/shared/components/ui/Field';
import GlassModal from '@/shared/components/ui/Modal';

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export const DatabaseBackupTab: React.FC = () => {
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [compression, setCompression] = useState('none');
  const [creating, setCreating] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [url, setUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  // Schedules (cron VACUUM INTO + retention + S3 push flag).
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [schedName, setSchedName] = useState('');
  const [schedCron, setSchedCron] = useState('0 2 * * *');
  const [schedKeep, setSchedKeep] = useState(7);
  const [schedAge, setSchedAge] = useState(30);
  const [schedComp, setSchedComp] = useState('none');
  const [schedS3, setSchedS3] = useState(false);
  const [schedBusy, setSchedBusy] = useState(false);
  const [pruneKeep, setPruneKeep] = useState(7);
  const [pruneAge, setPruneAge] = useState(30);

  // S3 remote (secret never displayed; only configured flag + bucket).
  const [s3, setS3] = useState<S3ConfigView | null>(null);
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Region, setS3Region] = useState('');
  const [s3Prefix, setS3Prefix] = useState('kspanel');
  const [s3Access, setS3Access] = useState('');
  const [s3Secret, setS3Secret] = useState('');
  const [s3Busy, setS3Busy] = useState(false);
  const [pullName, setPullName] = useState('');

  // Sub-page modals opened from the top-right buttons.
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'file' | 'url'>('file');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, scheds, s3cfg] = await Promise.all([
        listDatabaseBackups(),
        listDBBackupSchedules().catch(() => [] as BackupSchedule[]),
        getBackupS3Config().catch(() => null),
      ]);
      setBackups(list);
      setSchedules(scheds);
      if (s3cfg) {
        setS3(s3cfg);
        setS3Endpoint(s3cfg.endpoint || '');
        setS3Bucket(s3cfg.bucket || '');
        setS3Region(s3cfg.region || '');
        setS3Prefix(s3cfg.prefix || 'kspanel');
        setS3Access(s3cfg.access_key || '');
      }
    } catch (e: any) {
      setError(e?.response?.data || e?.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Allow the top-right header buttons in Database.tsx to open the sub-page modals.
  useEffect(() => {
    const onCreate = () => setCreateOpen(true);
    const onUpload = () => { setUploadTab('file'); setUploadOpen(true); };
    window.addEventListener('backup:create', onCreate);
    window.addEventListener('backup:upload', onUpload);
    return () => {
      window.removeEventListener('backup:create', onCreate);
      window.removeEventListener('backup:upload', onUpload);
    };
  }, []);

  const handleCreate = async () => {
    const n = name.trim();
    if (!n) { setMsg({ tone: 'err', text: 'Enter a backup name.' }); return; }
    if (n.length > 64) { setMsg({ tone: 'err', text: 'Name too long (max 64 chars).' }); return; }
    setCreating(true);
    setMsg(null);
    try {
      const b = await createDatabaseBackup(n, compression);
      setMsg({ tone: 'ok', text: `Backup created: ${b.filename} (${formatBytes(b.size_bytes)}, ${b.compression})` });
      setName('');
      setCreateOpen(false);
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Create failed' });
    } finally { setCreating(false); }
  };

  const handleCreateSchedule = async () => {
    if (!schedCron.trim()) { setMsg({ tone: 'err', text: 'Cron is required (5-field, e.g. "0 2 * * *").' }); return; }
    setSchedBusy(true);
    setMsg(null);
    try {
      await createDBBackupSchedule({
        name: schedName.trim() || 'nightly', cron: schedCron.trim(), enabled: true,
        keep_last_n: Number(schedKeep) || 7, max_age_days: Number(schedAge) || 30,
        compression: schedComp, s3_push: schedS3,
      });
      setMsg({ tone: 'ok', text: 'Schedule created.' });
      setSchedName('');
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Schedule create failed' });
    } finally { setSchedBusy(false); }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!window.confirm('Delete this schedule?')) return;
    try {
      await deleteDBBackupSchedule(id);
      setMsg({ tone: 'ok', text: 'Schedule deleted.' });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Delete failed' });
    }
  };

  const handleToggleSchedule = async (s: BackupSchedule) => {
    try {
      await updateDBBackupSchedule(s.id, {
        name: s.name, cron: s.cron, enabled: !s.enabled,
        keep_last_n: s.keep_last_n, max_age_days: s.max_age_days,
        compression: s.compression, s3_push: s.s3_push,
      });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Toggle failed' });
    }
  };

  const handlePrune = async () => {
    try {
      const r = await pruneDBBackups(Number(pruneKeep) || 7, Number(pruneAge) || 30);
      setMsg({ tone: 'ok', text: `Pruned ${r.count} backup(s).` });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Prune failed' });
    }
  };

  const handleSaveS3 = async () => {
    if (!s3Endpoint.trim() || !s3Bucket.trim() || !s3Access.trim() || !s3Secret) {
      setMsg({ tone: 'err', text: 'Endpoint, bucket, access key and secret are required.' });
      return;
    }
    setS3Busy(true);
    setMsg(null);
    try {
      await putBackupS3Config({
        endpoint: s3Endpoint.trim(), bucket: s3Bucket.trim(), region: s3Region.trim(),
        prefix: s3Prefix.trim(), access_key: s3Access.trim(), secret_key: s3Secret,
      });
      setS3Secret('');
      setMsg({ tone: 'ok', text: 'S3 remote saved (secret sealed, never shown).' });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'S3 save failed' });
    } finally { setS3Busy(false); }
  };

  const handlePushS3 = async (b: DatabaseBackup) => {
    setBusyId(b.id);
    try {
      await pushDBBackupToS3(b.id);
      setMsg({ tone: 'ok', text: `Pushed ${b.filename} to S3.` });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'S3 push failed' });
    } finally { setBusyId(null); }
  };

  const handlePullS3 = async () => {
    if (!pullName.trim()) { setMsg({ tone: 'err', text: 'Enter the remote filename to pull.' }); return; }
    try {
      await pullDBBackupFromS3(pullName.trim());
      setMsg({ tone: 'ok', text: `Pulled ${pullName.trim()} from S3.` });
      setPullName('');
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'S3 pull failed' });
    }
  };

  const handleDownload = async (b: DatabaseBackup) => {
    setBusyId(b.id);
    try {
      const blob = await downloadDatabaseBackup(b.id);
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = b.filename || `${b.id}.db`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(objectUrl);
      a.remove();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Download failed' });
    } finally { setBusyId(null); }
  };

  const handleRestore = async (b: DatabaseBackup) => {
    if (!window.confirm(`Restore database from "${b.filename}"?\n\nThis will replace the live database file. The current file is stowed as .bak and the panel must be restarted.`)) return;
    setBusyId(b.id);
    setMsg(null);
    try {
      const r = await restoreDatabaseBackup(b.id);
      setMsg({ tone: 'ok', text: r.message || `Restored from ${b.filename} — restart kspanel launch to apply.` });
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Restore failed' });
    } finally { setBusyId(null); }
  };

  const handleDelete = async (b: DatabaseBackup) => {
    if (!window.confirm(`Delete backup "${b.filename}"? This cannot be undone.`)) return;
    setBusyId(b.id);
    setMsg(null);
    try {
      await deleteDatabaseBackup(b.id);
      setMsg({ tone: 'ok', text: `Deleted ${b.filename}` });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Delete failed' });
    } finally { setBusyId(null); }
  };

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setMsg({ tone: 'err', text: 'Choose a .db file first.' }); return; }
    setUploading(true);
    setMsg(null);
    try {
      const b = await uploadDatabaseBackup(f);
      setMsg({ tone: 'ok', text: `Uploaded ${b.filename} (${formatBytes(b.size_bytes)})` });
      if (fileRef.current) fileRef.current.value = '';
      setUploadOpen(false);
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Upload failed' });
    } finally { setUploading(false); }
  };

  const handleUrlUpload = async () => {
    const u = url.trim();
    if (!u) { setMsg({ tone: 'err', text: 'Enter a URL.' }); return; }
    setUrlBusy(true);
    setMsg(null);
    try {
      const b = await uploadDatabaseBackupByURL(u);
      setMsg({ tone: 'ok', text: `Fetched backup ${b.filename} from URL (${formatBytes(b.size_bytes)})` });
      setUrl('');
      setUploadOpen(false);
      await load();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'URL upload failed' });
    } finally { setUrlBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-sky-300">
            <path d="M12 2l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <h3 className="text-sm font-semibold text-white">Backups</h3>
          <span className="text-xs text-gray-500 ml-2">{backups.length} saved</span>
          <button onClick={load} disabled={loading} className="ml-auto ks-btn-header ks-icon-btn p-1.5 rounded-md text-gray-400 hover:text-white disabled:opacity-40" title="Refresh list" aria-label="Refresh">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Create named snapshots of the current database (SQLite <code className="font-mono text-gray-300">VACUUM INTO</code>). Each backup lives under <code className="font-mono text-gray-300">{`<DataDir>/backups`}</code> and can be restored, downloaded, or re-uploaded. Restore replaces the live <code className="font-mono text-gray-300">kspanel.db</code> — restart <code className="font-mono text-gray-300">kspanel launch</code> to apply.
        </p>

        {msg && (
          <div className={`rounded-md p-2 text-sm border ${msg.tone === 'ok' ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-200' : 'bg-red-900/20 border-red-700/40 text-red-200'}`}>
            {msg.text}
          </div>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {/* Create sub-page modal */}
      <GlassModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Backup"
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} className="ks-btn-cancel ks-btn-ghost border border-white/10 px-4 py-1.5 rounded-md text-sm text-gray-300 hover:text-white">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="ks-primary-btn inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm disabled:opacity-40"
            >
              {creating && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.22-8.55" strokeLinecap="round" /></svg>}
              Create
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-400">Give the snapshot a short name. It becomes part of the on-disk filename <code className="font-mono text-gray-300">kspanel-&lt;timestamp&gt;-&lt;name&gt;.db</code> (letters, numbers, “-”, “_”). Postgres/MySQL live engines use a native <code className="font-mono text-gray-300">pg_dump / mysqldump</code> artifact instead, falling back to a SQLite snapshot when the tool is missing.</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="my-backup  (letters, numbers, -, _)"
          maxLength={64}
          disabled={creating}
          autoFocus
          className={glassFieldClass + ' font-mono text-sm disabled:opacity-50'}
        />
        <label className="block text-xs text-gray-400">
          Compression
          <select value={compression} onChange={(e) => setCompression(e.target.value)} disabled={creating} className={glassFieldClass + ' mt-1 text-sm'}>
            <option value="none">none</option>
            <option value="gzip">gzip</option>
            <option value="zstd">zstd (needs zstd binary)</option>
          </select>
        </label>
      </GlassModal>

      {/* Upload sub-page modal with tabs: file / URL */}
      <GlassModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Backup"
        footer={
          uploadTab === 'file' ? (
            <>
              <button onClick={() => setUploadOpen(false)} className="ks-btn-cancel ks-btn-ghost border border-white/10 px-4 py-1.5 rounded-md text-sm text-gray-300 hover:text-white">Cancel</button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="ks-btn-ghost border border-white/10 px-4 py-1.5 rounded-md text-sm disabled:opacity-40 inline-flex items-center gap-2 bg-white text-black hover:bg-gray-200"
              >
                {uploading && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.22-8.55" strokeLinecap="round" /></svg>}
                Upload
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setUploadOpen(false)} className="ks-btn-cancel ks-btn-ghost border border-white/10 px-4 py-1.5 rounded-md text-sm text-gray-300 hover:text-white">Cancel</button>
              <button
                onClick={handleUrlUpload}
                disabled={urlBusy}
                className="ks-btn-ghost border border-white/10 px-4 py-1.5 rounded-md text-sm disabled:opacity-40 inline-flex items-center gap-2 bg-white text-black hover:bg-gray-200"
              >
                {urlBusy && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.22-8.55" strokeLinecap="round" /></svg>}
                Fetch &amp; Save
              </button>
            </>
          )
        }
      >
        <div className="flex gap-1 p-1 bg-black/30 border border-white/10 rounded-md">
          <button
            onClick={() => setUploadTab('file')}
            className={`flex-1 px-3 py-1.5 rounded text-sm inline-flex items-center justify-center gap-1.5 ${uploadTab === 'file' ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            From file
          </button>
          <button
            onClick={() => setUploadTab('url')}
            className={`flex-1 px-3 py-1.5 rounded text-sm inline-flex items-center justify-center gap-1.5 ${uploadTab === 'url' ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            From URL
          </button>
        </div>

        {uploadTab === 'file' ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Choose a <code className="font-mono text-gray-300">.db</code> file. It is verified as a valid SQLite database before it is stored.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".db,.sqlite,.sqlite3,application/octet-stream"
              disabled={uploading}
              className="block w-full text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white file:text-black file:text-sm hover:file:bg-gray-200 disabled:opacity-50"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">The panel fetches the URL <span className="text-emerald-300">server-side</span> (SSRF-guarded — only public hosts, DNS-pinned, 512 MiB cap).</p>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUrlUpload(); }}
              placeholder="https://example.com/kspanel-backup.db"
              disabled={urlBusy}
              className={glassFieldClass + ' font-mono text-sm disabled:opacity-50'}
            />
            <p className="text-[11px] text-gray-500">The remote file must be a valid SQLite database.</p>
          </div>
        )}
      </GlassModal>

      {/* List */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-white">Saved backups</h4>
          <span className="text-xs text-gray-500">{loading ? 'loading…' : `${backups.length} file(s)`}</span>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : backups.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-black/20 p-6 text-center">
            <p className="text-sm text-gray-400">No backups yet.</p>
            <p className="text-xs text-gray-500 mt-1">Create one by name above — every backup is stored as a timestamped <code className="font-mono text-gray-300">kspanel-&lt;ts&gt;-&lt;name&gt;.db</code> file.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-gray-500">
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-2 font-medium">File</th>
                  <th className="text-left py-2 px-2 font-medium">Created</th>
                  <th className="text-right py-2 px-2 font-medium">Size</th>
                  <th className="text-left py-2 px-2 font-medium">Source</th>
                  <th className="text-left py-2 px-2 font-medium">Codec/S3</th>
                  <th className="text-right py-2 pl-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.03]">
                    <td className="py-2 pr-2 align-top">
                      <div className="font-mono text-gray-200 text-xs break-all" title={b.filename}>{b.filename}</div>
                      <div className="text-[11px] text-gray-500 font-mono truncate max-w-[16rem]" title={b.sha256}>{b.sha256.slice(0, 12)}…</div>
                    </td>
                    <td className="py-2 px-2 align-top text-xs text-gray-300 whitespace-nowrap" title={b.created_at}>{fmtDate(b.created_at)}</td>
                    <td className="py-2 px-2 align-top text-right tabular-nums text-gray-300 whitespace-nowrap">{formatBytes(b.size_bytes)}</td>
                    <td className="py-2 px-2 align-top">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide border ${b.source === 'uploaded' ? 'bg-amber-900/20 border-amber-700/40 text-amber-200' : b.source === 'vacuum-into' ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-200' : 'bg-white/5 border-white/10 text-gray-300'}`}>
                        {b.source}
                      </span>
                    </td>
                    <td className="py-2 px-2 align-top text-xs">
                      <span className="text-gray-300 font-mono">{b.compression || 'none'}</span>
                      {b.s3_pushed && <span className="ml-1 text-emerald-300">·S3</span>}
                    </td>
                    <td className="py-2 pl-2 align-top">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button
                          onClick={() => handleRestore(b)}
                          disabled={busyId === b.id}
                          title="Restore — replaces live DB, restart required"
                          className="px-2 py-1 rounded bg-amber-700/30 hover:bg-amber-700/50 border border-amber-700/40 text-amber-200 text-xs disabled:opacity-40"
                        >Restore</button>
                        <button
                          onClick={() => handleDownload(b)}
                          disabled={busyId === b.id}
                          className="px-2 py-1 rounded bg-sky-900/30 hover:bg-sky-900/50 border border-sky-700/40 text-sky-200 text-xs disabled:opacity-40"
                        >Download</button>
                        <button
                          onClick={() => handlePushS3(b)}
                          disabled={busyId === b.id}
                          title="Push to S3 remote"
                          className="px-2 py-1 rounded bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-700/40 text-emerald-200 text-xs disabled:opacity-40"
                        >S3↑</button>
                        <button
                          onClick={() => handleDelete(b)}
                          disabled={busyId === b.id}
                          className="px-2 py-1 rounded bg-red-900/20 hover:bg-red-900/40 border border-red-700/40 text-red-200 text-xs disabled:opacity-40"
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Schedules */}
      <div className="glass-card ks-form-card rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-white">Scheduled backups (cron 5-field)</h4>
        <p className="text-xs text-gray-400">Cron drives <code className="font-mono text-gray-300">VACUUM INTO</code> / native dumps on the scheduler tick, then prunes to <code className="font-mono text-gray-300">keep_last_n + max_age_days</code> and optionally pushes to S3.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={schedName} onChange={(e) => setSchedName(e.target.value)} placeholder="nightly" maxLength={64} className={glassFieldClass + ' font-mono text-sm'} />
          <input value={schedCron} onChange={(e) => setSchedCron(e.target.value)} placeholder="0 2 * * *" className={glassFieldClass + ' font-mono text-sm'} title="5-field cron: minute hour dom month dow" />
          <label className="text-xs text-gray-400">keep_n <input type="number" value={schedKeep} onChange={(e) => setSchedKeep(Number(e.target.value))} min={1} max={1000} className={glassFieldClass + ' mt-1 text-sm'} /></label>
          <label className="text-xs text-gray-400">max_age_days <input type="number" value={schedAge} onChange={(e) => setSchedAge(Number(e.target.value))} min={1} max={3650} className={glassFieldClass + ' mt-1 text-sm'} /></label>
          <label className="text-xs text-gray-400">codec
            <select value={schedComp} onChange={(e) => setSchedComp(e.target.value)} className={glassFieldClass + ' mt-1 text-sm'}>
              <option value="none">none</option>
              <option value="gzip">gzip</option>
              <option value="zstd">zstd</option>
            </select>
          </label>
          <label className="text-xs text-gray-400 flex items-center gap-2"><input type="checkbox" checked={schedS3} onChange={(e) => setSchedS3(e.target.checked)} /> S3 push</label>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCreateSchedule} disabled={schedBusy} className="ks-primary-btn px-4 py-1.5 rounded-md text-sm disabled:opacity-40">Add schedule</button>
        </div>
        {schedules.length > 0 && (
          <div className="space-y-1">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs text-gray-300 border border-white/10 rounded-md px-2 py-1.5">
                <span className="font-mono">{s.name || `#${s.id}`}</span>
                <span className="font-mono text-gray-500">{s.cron}</span>
                <span className="text-gray-500">keep {s.keep_last_n}/{s.max_age_days}d {s.compression}{s.s3_push ? ' +S3' : ''}</span>
                <span className={s.enabled ? 'text-emerald-300' : 'text-gray-500'}>{s.enabled ? 'on' : 'off'}</span>
                <span className="ml-auto flex gap-1">
                  <button onClick={() => handleToggleSchedule(s)} className="px-2 py-0.5 rounded border border-white/10 hover:bg-white/5">{s.enabled ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => handleDeleteSchedule(s.id)} className="px-2 py-0.5 rounded border border-red-700/40 text-red-200 hover:bg-red-900/30">Delete</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 border-t border-white/10">
          <span className="text-xs text-gray-400">Retention prune now:</span>
          <input type="number" value={pruneKeep} onChange={(e) => setPruneKeep(Number(e.target.value))} min={1} max={1000} className={glassFieldClass + ' w-20 text-sm'} />
          <input type="number" value={pruneAge} onChange={(e) => setPruneAge(Number(e.target.value))} min={1} max={3650} className={glassFieldClass + ' w-20 text-sm'} />
          <button onClick={handlePrune} className="px-3 py-1.5 rounded-md text-sm border border-white/10 hover:bg-white/5">Prune</button>
        </div>
      </div>

      {/* S3 remote */}
      <div className="glass-card ks-form-card rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-white">S3 / remote push (rclone-style)</h4>
        <p className="text-xs text-gray-400">Path-style <code className="font-mono text-gray-300">endpoint/bucket/prefix/filename</code> via SigV4. The secret is sealed with the panel vault and never displayed or logged{s3?.configured ? ` — configured for bucket “${s3.bucket}”.` : ' — not configured.'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} placeholder="https://s3.example.com" className={glassFieldClass + ' font-mono text-sm'} />
          <input value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} placeholder="bucket" className={glassFieldClass + ' font-mono text-sm'} />
          <input value={s3Region} onChange={(e) => setS3Region(e.target.value)} placeholder="us-east-1" className={glassFieldClass + ' font-mono text-sm'} />
          <input value={s3Prefix} onChange={(e) => setS3Prefix(e.target.value)} placeholder="kspanel" className={glassFieldClass + ' font-mono text-sm'} />
          <input value={s3Access} onChange={(e) => setS3Access(e.target.value)} placeholder="access key" autoComplete="off" className={glassFieldClass + ' font-mono text-sm'} />
          <input value={s3Secret} onChange={(e) => setS3Secret(e.target.value)} placeholder="secret key (never shown)" type="password" autoComplete="new-password" className={glassFieldClass + ' font-mono text-sm'} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleSaveS3} disabled={s3Busy} className="ks-primary-btn px-4 py-1.5 rounded-md text-sm disabled:opacity-40">Save remote</button>
          <input value={pullName} onChange={(e) => setPullName(e.target.value)} placeholder="kspanel-...-.db to pull" className={glassFieldClass + ' font-mono text-sm flex-1 min-w-[12rem]'} />
          <button onClick={handlePullS3} className="px-3 py-1.5 rounded-md text-sm border border-white/10 hover:bg-white/5">S3↓ pull</button>
        </div>
      </div>
    </div>
  );
};

export default DatabaseBackupTab;
