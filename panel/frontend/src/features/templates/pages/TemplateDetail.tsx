import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listTemplates, downloadTemplate, listInstances, deleteTemplate } from '@/shared/api/admin';
import type { Template } from '@/shared/types/instance';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { useConfirm } from '@/shared/stores/confirmStore';

function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof (data as any).error === 'string') return (data as any).error;
    if (typeof (data as any).message === 'string') return (data as any).message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function parseSpec(raw: string): Record<string, any> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, any>; } catch { return {}; }
}

function kindMeta(kind: string) {
  const k = (kind || '').toLowerCase();
  if (k === 'docker') return { label: 'Docker', cls: 'bg-sky-900/50 border-sky-700/40 text-sky-200', dot: 'bg-sky-400' };
  if (k === 'lxd') return { label: 'LXD', cls: 'bg-indigo-900/50 border-indigo-700/40 text-indigo-200', dot: 'bg-indigo-400' };
  if (k === 'kvm') return { label: 'KVM', cls: 'bg-orange-900/50 border-orange-700/40 text-orange-200', dot: 'bg-orange-400' };
  if (k === 'multipass') return { label: 'Multipass', cls: 'bg-fuchsia-900/50 border-fuchsia-700/40 text-fuchsia-200', dot: 'bg-fuchsia-400' };
  return { label: kind || 'Unknown', cls: 'bg-white/5 border-white/10 text-gray-300', dot: 'bg-gray-500' };
}

const TemplateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [specOpen, setSpecOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const [instanceStats, setInstanceStats] = useState<{ total: number; running: number; stopped: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) {
        setError('Invalid template ID');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const templates = await listTemplates();
        if (cancelled) return;
        const t = templates.find((x) => x.id === numericId) || null;
        setTemplate(t);
        if (!t) {
          setError('');
        } else {
          // best-effort instance usage breakdown
          listInstances().then((all) => {
            if (cancelled) return;
            const mine = all.filter((ins) => ins.template_id === numericId);
            setInstanceStats({
              total: mine.length,
              running: mine.filter((i) => i.status === 'running').length,
              stopped: mine.filter((i) => i.status === 'stopped').length,
            });
          }).catch(() => {});
        }
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load template'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, numericId, validId]);

  const back = () => navigate('/templates');

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  };

  const handleDownload = async () => {
    if (!template) return;
    setDownloading(true);
    try {
      const blob = await downloadTemplate(template.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(getErrorMessage(e, 'Download failed'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    if (!(await confirm({ title: 'Delete template', message: `Delete template "${template.name}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await deleteTemplate(template.id);
      navigate('/templates');
    } catch (e: any) {
      alert(getErrorMessage(e, 'Failed to delete template'));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-40 bg-white/5 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => <div key={i} className="h-20 bg-white/5 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Templates list">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Template Detail</h2>
        </div>
        <GlassCard className="p-6 border border-red-900/40">
          <p className="text-red-400 text-sm">{error}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Retry</button>
            <button onClick={back} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back</button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Template Detail</h2>
        </div>
        <GlassCard className="p-6">
          <p className="text-gray-400">Template not found</p>
          <button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back to templates</button>
        </GlassCard>
      </div>
    );
  }

  const spec = parseSpec(template.spec);
  // Surface invalid JSON instead of silently rendering empty sections.
  let specInvalid = false;
  try { JSON.parse(template.spec || '{}'); } catch { specInvalid = true; }
  const kind = kindMeta(template.kind);
  const limits = spec.limits || {};
  const ports: any[] = Array.isArray(spec.ports) ? spec.ports : [];
  const env: any[] = Array.isArray(spec.env) ? spec.env : [];
  const mounts: any[] = Array.isArray(spec.mounts) ? spec.mounts : [];
  const install: any[] = Array.isArray(spec.install) ? spec.install : [];
  const actions: any[] = Array.isArray(spec.actions) ? spec.actions : [];
  const caps = spec.caps || {};
  const pages: any[] = Array.isArray(spec.pages) ? spec.pages : [];
  const prettySpec = (() => {
    try { return JSON.stringify(spec, null, 2); } catch { return template.spec || '{}'; }
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Templates list">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-white truncate">Template Detail</h2>
          <p className="text-xs text-gray-500 truncate">ID {template.id} · {template.kind} · {relativeTime(template.created_at)}</p>
        </div>
        <CardMenu
          ariaLabel={`Actions for template ${template.name}`}
          items={[
            { key: 'edit', label: 'Edit template', tone: 'default' },
            { key: 'download', label: downloading ? 'Downloading…' : 'Download JSON', tone: 'default' },
            { key: 'copyId', label: copied === 'id' ? 'Copied!' : 'Copy ID', tone: 'default' },
            { key: 'copySpec', label: copied === 'spec' ? 'Copied!' : 'Copy spec', tone: 'default' },
            { key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger', disabled: deleting },
          ]}
          onSelect={(k) => {
            if (k === 'edit') navigate(`/templates/${template.id}/edit`);
            if (k === 'download') handleDownload();
            if (k === 'copyId') copy(String(template.id), 'id');
            if (k === 'copySpec') copy(prettySpec, 'spec');
            if (k === 'delete') handleDelete();
          }}
        />
      </div>

      <GlassCard className="ks-stat-card p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-white/[0.05] border border-white/10 text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 1 1 10 0v4" />
              <path d="M12 2v4" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate" title={template.name}>{template.name}</h3>
            <p className="text-[11px] text-gray-400 font-mono">ID: {template.id} · {template.kind}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${kind.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${kind.dot}`} />
            {kind.label}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Created</h4>
            <p className="text-xs text-white mt-1" title={formatDate(template.created_at)}>{formatDate(template.created_at)}</p>
            <p className="text-[11px] text-gray-500">{relativeTime(template.created_at)}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Updated</h4>
            <p className="text-xs text-white mt-1" title={formatDate(template.updated_at)}>{formatDate(template.updated_at)}</p>
            <p className="text-[11px] text-gray-500">{relativeTime(template.updated_at)}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Instances</h4>
            <p className="text-lg font-semibold text-white leading-none mt-1">{instanceStats === null ? '—' : instanceStats.total}</p>
            {instanceStats && instanceStats.total > 0 ? (
              <>
                <p className="text-[11px] text-gray-500">{instanceStats.running} running · {instanceStats.stopped} stopped</p>
                <button onClick={() => navigate('/instances')} className="mt-1 text-[11px] text-sky-300 hover:text-sky-200 hover:underline">View instances →</button>
              </>
            ) : (
              <p className="text-[11px] text-gray-500">{instanceStats === null ? 'loading usage…' : 'no instances use this template'}</p>
            )}
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Spec items</h4>
            <p className="text-xs text-white mt-1 truncate">{ports.length} ports · {env.length} env · {mounts.length} mounts</p>
            <p className="text-[11px] text-gray-500">{install.length} install steps · {actions.length} actions</p>
          </div>
        </div>

        {template.description && (
          <div className="mt-4">
            <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">Description</h4>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">{template.description}</p>
          </div>
        )}

        {specInvalid && (
          <div className="mt-4 rounded-lg border border-amber-700/40 bg-amber-900/30 px-3 py-2 flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-amber-300 shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            <div>
              <p className="text-xs font-medium text-amber-200">Spec is not valid JSON</p>
              <p className="text-[11px] text-amber-200/70 mt-0.5">The sections below may be incomplete. Fix the spec in the template editor.</p>
            </div>
          </div>
        )}

        {template.image && (
          <div className="mt-4">
            <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1 flex items-center gap-2">Image
              <button onClick={() => copy(template.image, 'image')} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" aria-label="Copy image">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg>
              </button>
              {copied === 'image' && <span className="text-[10px] text-emerald-300">copied</span>}
            </h4>
            <p className="text-sm text-gray-200 font-mono break-all rounded-lg border border-white/5 bg-black/20 px-3 py-2">{template.image}</p>
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Resources</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Memory</span><span className="text-white font-mono text-xs">{limits.memory || limits['memory'] || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">CPU</span><span className="text-white font-mono text-xs">{limits.cpus || limits.cpu || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Disk</span><span className="text-white font-mono text-xs">{limits.disk || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Swap</span><span className="text-white font-mono text-xs">{limits['memory-swap'] || limits.swap || '—'}</span></div>
            {caps && (caps.databases || caps.backups || caps.networks) ? (
              <div className="pt-1.5 mt-1.5 border-t border-white/5 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Caps: databases</span><span className="text-white">{String(caps.databases ?? '—')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">backups</span><span className="text-white">{String(caps.backups ?? '—')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">networks</span><span className="text-white">{String(caps.networks ?? '—')}</span></div>
              </div>
            ) : null}
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Network & Mounts</h4>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Ports · {ports.length}</p>
              {ports.length === 0 ? <p className="text-xs text-gray-500">No ports</p> : (
                <ul className="mt-1 space-y-1 max-h-24 overflow-auto pr-1">
                  {ports.map((p: any, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-xs font-mono text-gray-300"><span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5">{p.host ?? p.container ?? '—'}:{p.container ?? p.host ?? '—'}</span><span className="text-gray-500">{p.protocol || 'tcp'}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Mounts · {mounts.length}</p>
              {mounts.length === 0 ? <p className="text-xs text-gray-500">No mounts</p> : (
                <ul className="mt-1 space-y-1 max-h-24 overflow-auto pr-1">
                  {mounts.map((m: any, i: number) => (
                    <li key={i} className="text-xs font-mono text-gray-300 truncate" title={`${m.source}:${m.target}`}>{m.source || '—'} → {m.target || '—'} <span className="text-gray-500">({m.mode || 'rw'})</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Environment · {env.length}</h4>
          {env.length === 0 ? <p className="text-xs text-gray-500">No env variables</p> : (
            <ul className="space-y-1 max-h-40 overflow-auto pr-1">
              {env.map((e: any, i: number) => (
                <li key={i} className="flex items-start gap-2 text-xs rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
                  <span className="font-mono text-sky-200 truncate">{e.key || e.name || `VAR_${i}`}</span>
                  <span className="text-gray-500 shrink-0">=</span>
                  <span className="font-mono text-gray-300 truncate" title={e.value ?? e.default ?? ''}>{e.value ?? e.default ?? <span className="text-gray-500 italic">no default</span>}</span>
                  {e.required && <span className="ml-auto text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/30 text-amber-200 shrink-0">required</span>}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Install & Actions</h4>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Install steps · {install.length}</p>
              {install.length === 0 ? <p className="text-xs text-gray-500">No install workflow</p> : (
                <ol className="mt-1 space-y-1 max-h-24 overflow-auto pr-1">
                  {install.map((s: any, i: number) => (
                    <li key={i} className="text-xs text-gray-300 truncate"><span className="text-gray-500 mr-1">{i+1}.</span>{s.action || s.command || s.url || s.content?.slice(0,30) || 'step'}</li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Actions · {actions.length}</p>
              {actions.length === 0 ? <p className="text-xs text-gray-500">No actions</p> : (
                <ul className="mt-1 space-y-1 max-h-24 overflow-auto pr-1">
                  {actions.map((a: any, i: number) => (
                    <li key={i} className="text-xs text-gray-300"><span className="font-mono text-white">{a.id || `action_${i}`}</span>{a.name ? ` · ${a.name}` : ''} <span className="text-gray-500">{a.description ? `— ${a.description.slice(0,40)}` : ''}</span></li>
                  ))}
                </ul>
              )}
            </div>
            {pages.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Pages · {pages.length}</p>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {pages.map((p: any, i: number) => (
                    <li key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-300">{p.slug || p.label || `page_${i}`}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <button onClick={() => setSpecOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors">
          <span className="text-xs uppercase tracking-wide text-gray-400">Raw spec JSON</span>
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">{specOpen ? 'Hide' : 'Show'} · {prettySpec.length} chars</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-gray-500 transition-transform ${specOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
          </span>
        </button>
        {specOpen && (
          <div className="border-t border-white/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={() => copy(prettySpec, 'spec2')} className="px-2.5 py-1 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">{copied === 'spec2' ? 'Copied!' : 'Copy JSON'}</button>
              <button onClick={handleDownload} disabled={downloading} className="px-2.5 py-1 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-50">{downloading ? 'Downloading…' : 'Download'}</button>
              <span className="text-[11px] text-gray-500 ml-auto">Kind: {template.kind}</span>
            </div>
            <pre className="max-h-80 overflow-auto rounded-lg border border-white/5 bg-black/30 p-3 text-[11px] font-mono text-gray-200 whitespace-pre-wrap break-all">{prettySpec}</pre>
          </div>
        )}
      </GlassCard>

      <div className="flex gap-2">
        <button onClick={() => navigate(`/templates/${template.id}/edit`)} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200">Edit template</button>
        <button onClick={handleDownload} disabled={downloading} className="px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-50">{downloading ? 'Downloading…' : 'Download JSON'}</button>
        <button onClick={back} className="ml-auto px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to templates</button>
      </div>
    </div>
  );
};

export default TemplateDetail;
