import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNodes, listTemplates, listUsers, listRoles, deployInstance } from '@/shared/api/admin';
import type { Node } from '@/shared/types/node';
import type { Template, DeployRequest } from '@/shared/types/instance';
import type { User, Role } from '@/shared/types/user';
import FormPage from '@/shared/components/forms/FormPage';
import GlassCard from '@/shared/components/ui/Card';
import { SearchableSelect, type SearchableOption } from '@/shared/components/ui/SearchableSelect';
import { glassFieldClass } from '@/shared/components/ui/Field';
import {
  KindIcon,
  TemplateCard,
  NodeCard,
} from '../components/InstanceFormComponents';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';
import { useDeployForm } from '../stores/deployFormStore';
import type {
  EnvVariable,
  PageOverride,
  IconPreset,
  ColorSwatch,
} from '../types/instanceForm';
import { KIND_META, ICON_PRESETS, COLOR_SWATCHES, driverEnabled, kindKey } from '../types/instanceForm';
import { buildOverrides } from '../utils/instanceFormUtils';

const monoCls = glassFieldClass + ' font-mono ks-input-mono';
const labelCls = 'block text-sm font-medium text-gray-300 mb-1 ks-label';
const sectionCls = 'border border-white/10 rounded-lg p-4 space-y-4 bg-black/20 ks-form-group';
const addBtn = 'text-xs text-sky-300 hover:text-sky-200 underline';

const InstanceForm: React.FC = () => {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [templateId, setTemplateId] = useState(0);
  const [nodeId, setNodeId] = useState(0);
  const [ownerId, setOwnerId] = useState(0);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string>('');
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  const deployCtx = useDeployForm();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ns, ts, us, rs] = await Promise.all([listNodes(), listTemplates(), listUsers(), listRoles()]);
        if (cancelled) return;
        setNodes(ns);
        setTemplates(ts);
        setUsers(us);
        setRoles(rs);
        setOwnerId(us[0]?.id || 0);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Local editors mirror the deploy form store so the local General section
  // sees the SAME pages/ports/env/etc. that the Advance Option page sees.
  // The store's seed-once-per-template behaviour seeds the editor whenever
  // the templateId changes — and every edit on either side flows back into
  // the shared store so navigating between Main and Advance preserves the
  // user's work in both directions.
  const editor = deployCtx.editor;
  const baseline = deployCtx.baseline;

  const selectTemplate = (tid: number) => {
    setTemplateId(tid);
    deployCtx.setTemplateId(tid);
  };

  const roleForId = (id: number) => roles.find((r) => r.id === id);

  const ownerOptions: SearchableOption<number>[] = useMemo(() => users.map((u) => {
    const role = roleForId(u.role_id);
    const badge = role ? (role.display_name || role.name) : 'user';
    return {
      value: u.id,
      label: u.username,
      description: u.email || 'no email',
      keywords: `${u.username} ${u.email} ${badge}`,
      badge,
    };
  }), [users, roles]);

  const renderOwnerRow = (opt: SearchableOption<number>, active: boolean) => {
    const u = users.find((x) => x.id === opt.value);
    if (!u) return <span className="truncate">{opt.label}</span>;
    const role = roleForId(u.role_id);
    const roleColor = role?.color || '#888';
    const initials = (u.username || '?').slice(0, 2).toUpperCase();
    return (
      <div className="flex items-center gap-2.5">
        <div
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white border border-white/15"
          style={{ background: (u.accent_color || roleColor) + '55' }}
          title={u.avatar_symbol || initials}
        >
          {u.avatar_symbol || initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm truncate ${active ? 'text-white' : 'text-gray-200'}`}>{u.username}</span>
            {role && (
              <span
                className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border"
                style={{ color: roleColor, borderColor: roleColor + '66', background: roleColor + '22' }}
              >
                {role.display_name || role.name}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{u.email || 'no email'}</p>
        </div>
      </div>
    );
  };

  const updateEnv = (i: number, patch: Partial<EnvVariable>) =>
    setEditor((f) => { const e = [...f.env]; e[i] = { ...e[i], ...patch }; return { ...f, env: e }; });
  const addEnv = () => setEditor((f) => ({ ...f, env: [...f.env, { name: '', label: '', description: '', default: '', user_viewable: true, user_editable: true, required: false, rule: '', display: 'text', options: '', prepend: '', append: false, append_value: '' }] }));
  const delEnv = (i: number) => setEditor((f) => ({ ...f, env: f.env.filter((_, j) => j !== i) }));

  const updatePort = (i: number, patch: Partial<any>) =>
    setEditor((f) => { const p = [...f.ports]; p[i] = { ...p[i], ...patch }; return { ...f, ports: p }; });
  const addPort = () => setEditor((f) => ({ ...f, ports: [...f.ports, { host: '', guest: '', protocol: 'tcp' }] }));
  const delPort = (i: number) => setEditor((f) => ({ ...f, ports: f.ports.filter((_, j) => j !== i) }));

  const updateMount = (i: number, patch: Partial<any>) =>
    setEditor((f) => { const m = [...f.mounts]; m[i] = { ...m[i], ...patch }; return { ...f, mounts: m }; });
  const addMount = () => setEditor((f) => ({ ...f, mounts: [...f.mounts, { source: '', target: '', mode: 'rw' }] }));
  const delMount = (i: number) => setEditor((f) => ({ ...f, mounts: f.mounts.filter((_, j) => j !== i) }));

  const updateLimits = (patch: Partial<any>) =>
    setEditor((f) => ({ ...f, limits: { ...f.limits, ...patch } }));
  const updateCaps = (patch: Partial<any>) =>
    setEditor((f) => ({ ...f, caps: { ...f.caps, ...patch } }));

  const updatePage = (i: number, patch: Partial<PageOverride>) =>
    setEditor((f) => { const p = [...f.pages]; p[i] = { ...p[i], ...patch }; return { ...f, pages: p }; });
  const removePage = (i: number) =>
    setEditor((f) => ({ ...f, pages: f.pages.filter((_, j) => j !== i) }));
  const movePage = (i: number, dir: -1 | 1) =>
    setEditor((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.pages.length) return f;
      const p = [...f.pages];
      [p[i], p[j]] = [p[j], p[i]];
      return { ...f, pages: p };
    });

  // Actions: the inline form keeps the same simple inline-handlers the
  // earlier non-store version had — the Advance Option page uses the
  // equivalent handlers through the store for its own re-renders.
  const updateAction = (i: number, patch: any) =>
    setEditor((f) => { const a = [...f.actions]; a[i] = { ...a[i], ...patch }; return { ...f, actions: a }; });
  const addAction = () =>
    setEditor((f) => ({
      ...f,
      actions: [...f.actions, {
        id: '', name: '', description: '', allowed_states: '', requires_online: false, async_run: false,
        run_on_create: false, cooldown_s: '0', user_invokable: false, session: 'long_running',
        auto_start_instance: false, auto_stop_on_exit: false, restart_on_failure: false,
        allowed_commands: '', blocked_commands: '', max_runtime_s: '0', stop_command: '',
        stop_mode: 'different', steps: [],
      }],
    }));
  const delAction = (i: number) =>
    setEditor((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }));

  const updateHealthcheck = (patch: any) =>
    setEditor((f) => ({ ...f, healthcheck: { ...f.healthcheck, ...patch } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Instance name is required'); return; }
    if (!ownerId) { setError('Select an owner'); return; }
    if (!templateId) { setError('Select a template'); return; }
    if (!nodeId) { setError('Select a node'); return; }
    const selectedTemplate = templates.find((t) => t.id === templateId);
    const selectedNode = nodes.find((n) => n.id === nodeId);
    if (selectedTemplate && selectedNode && !driverEnabled(selectedNode, kindKey(selectedTemplate.kind))) {
      setError(`Cannot deploy: node "${selectedNode.name}" doesn't advertise the ${kindKey(selectedTemplate.kind)} driver. Install it on that edge host or pick another node.`);
      return;
    }
    setDeploying(true);
    setError('');
    const envVarPayload: Record<string, string> = {};
    for (const v of editor.env) {
      if (!v.name) continue;
      const val = envValues[v.name];
      if (val === undefined) continue;
      if (val === '' && !v.required) continue;
      if (val === v.default && !v.required) continue;
      envVarPayload[v.name] = val;
    }

    const payload: DeployRequest = {
      name: name.trim(),
      display_name: displayName.trim() || undefined,
      icon: icon || undefined,
      color: color || undefined,
      owner_id: ownerId,
      template_id: templateId,
      node_id: nodeId,
      overrides: buildOverrides(editor, baseline),
      env_vars: Object.keys(envVarPayload).length ? envVarPayload : undefined,
    };
    try {
      await deployInstance(payload);
      navigate('/instances');
    } catch (e: any) {
      const d = e?.response?.data;
      let msg = 'Deployment failed.';
      if (d && typeof d === 'object') {
        const parts = [d.error, d.detail].filter(Boolean);
        if (d.node) parts.push(`edge: ${d.node}`);
        if (d.kind) parts.push(`driver: ${d.kind}`);
        msg = parts.filter((p) => String(p).trim() !== '').join(' — ') || msg;
      } else if (typeof d === 'string') {
        const looksLikeHtml = /^\s*<(?:html|!doctype)/i.test(d) || /<\s*html/i.test(d.slice(0, 200));
        if (looksLikeHtml || d.length > 240) {
          const status = e?.response?.status ? ` (HTTP ${e.response.status})` : '';
          msg =
            `Deployment failed${status}: the panel origin returned a non-JSON ` +
            'response (likely a proxy/CDN error page). This usually means the ' +
            'edge took too long to provision the instance and an upstream ' +
            'timeout fired. Confirm the edge node is reachable, docker is ' +
            'installed there, and any container image is already pulled.';
        } else if (d.trim()) {
          msg = d.trim();
        }
      } else if (e?.message) {
        msg = e.message;
      }
      if (e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED') {
        msg = 'Could not reach the panel origin (network/proxy error).';
      }
      setError(msg);
    } finally {
      setDeploying(false);
    }
  };

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Deploy Instance' }]}
        saving={false}
        submitLabel="Deploy"
        maxWidth="max-w-3xl"
      >
        <p className="text-gray-400 text-sm">Loading…</p>
      </FormPage>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedNode = nodes.find((n) => n.id === nodeId);
  const selectedOwner = users.find((u) => u.id === ownerId);
  const driverMissing = selectedTemplate && selectedNode && !driverEnabled(selectedNode, kindKey(selectedTemplate.kind));

  return (
    <FormPage
      crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Deploy Instance' }]}
      saving={deploying}
      submitLabel="Deploy"
      submittingLabel="Deploying…"
      onSubmit={submit}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-6">
        {error && (
          <GlassCard className="border-red-600/40 bg-red-950/30">
            <div className="flex items-start gap-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-5 h-5 text-red-400 shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><path d="M12 16h.01" />
               </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-200">Deployment failed</p>
                <p className="text-sm text-red-300/90 mt-0.5 break-words">{error}</p>
              </div>
            </div>
          </GlassCard>
        )}

        {driverMissing && (
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-700/30 rounded-md px-3 py-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 shrink-0">
              <path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" />
             </svg>
            Selected node <span className="font-medium text-amber-200">{selectedNode?.name}</span> doesn't advertise the
            {' '}{kindKey(selectedTemplate!.kind)} driver — deploy may fail. Enable the driver on that edge or pick another node.
          </div>
        )}

        <GlassCard className="">
            <div className="mb-1">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">General</h3>
              <p className="text-xs text-gray-500">Name, owner, node and template — everything the deployment runs on.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Instance name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={glassFieldClass}
                  placeholder="e.g. game-01"
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>Display name <span className="text-xs text-gray-500 font-normal">(optional)</span></label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={glassFieldClass}
                  placeholder="Human-readable label shown in the UI"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className={labelCls}>Icon <span className="text-xs text-gray-500 font-normal">(optional)</span></label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {ICON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setIcon(p.svg)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${icon === p.svg ? 'border-sky-400/60 bg-sky-500/15' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                      title={p.label}
                    >
                      {p.svg && (
                        <span dangerouslySetInnerHTML={{ __html: p.svg.replace(/<svg /, '<svg width="16" height="16" ') }} />
                      )}
                      <span className="text-xs text-gray-300">{p.label}</span>
                    </button>
                  ))}
                </div>
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className={glassFieldClass}
                  placeholder="Paste custom SVG or pick a preset above"
                />
              </div>
              <div>
                <label className={labelCls}>Colour <span className="text-xs text-gray-500 font-normal">(optional)</span></label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      className={`w-8 h-8 rounded-lg border transition-transform ${color === c.value && c.value ? 'border-white scale-105' : color === c.value && !c.value ? 'border-white/50' : 'border-white/10 hover:border-white/30'}`}
                      style={{ backgroundColor: c.value || 'transparent' }}
                      title={c.label}
                    >
                      {color === c.value && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-5 h-5 m-auto"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </button>
                  ))}
                </div>
                <input
                  type="color"
                  value={color || '#a78bfa'}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full h-10 rounded-lg border border-white/10 cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Owner</label>
                {users.length === 0 ? (
                  <GlassCard className="text-center text-gray-400 text-sm">No users available.</GlassCard>
                ) : (
                  <SearchableSelect<number>
                    options={ownerOptions}
                    value={ownerId}
                    onChange={setOwnerId}
                    placeholder="Search owners by name or email…"
                    emptyMessage="No owners match"
                    renderRow={renderOwnerRow}
                    groupLabel="Users"
                  />
                )}
                {selectedOwner && (
                  <p className="text-xs text-gray-500 mt-1.5 truncate">
                    {selectedOwner.email || 'no email'}
                  </p>
                )}
              </div>
            </GlassCard>
            <div className="border-t border-white/10 pt-4 mt-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Template</h4>
                  <p className="text-xs text-gray-500">Pick the blueprint that defines this instance.</p>
                </div>
                <span className="text-xs text-gray-500 shrink-0">{templates.length} available</span>
              </div>
              {templates.length === 0 ? (
                <GlassCard className="text-center text-gray-400 text-sm">No templates available.</GlassCard>
              ) : (
                <div className="ks-card-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templates.map((t) => (
                    <TemplateCard
                      key={t.id}
                      t={t}
                      selected={t.id === templateId}
                      onClick={() => selectTemplate(t.id)}
                    />
                  ))}
                </div>
              )}
              {!selectedTemplate && (
                <p className="text-xs text-amber-200/90 bg-amber-950/30 border border-amber-700/30 rounded-md px-3 py-2 mt-3">
                  Choose a template first — its configuration appears on the other tabs.
                </p>
              )}
            </div>

            <div className="border-t border-white/10 pt-4 mt-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Node</h4>
                  <p className="text-xs text-gray-500 truncate">Where the instance runs — the node must advertise this template's driver.</p>
                </div>
                <span className="text-xs text-gray-500 shrink-0">{nodes.length} available</span>
              </div>
              {nodes.length === 0 ? (
                <GlassCard className="text-center text-gray-400 text-sm">No nodes available.</GlassCard>
              ) : (
                <div className="ks-card-grid grid grid-cols-1 sm:grid-cols-2">
                  {nodes.map((n) => (
                    <NodeCard
                      key={n.id}
                      n={n}
                      selected={n.id === nodeId}
                      incompatibleKind={selectedTemplate && !driverEnabled(n, kindKey(selectedTemplate.kind)) ? KIND_META[kindKey(selectedTemplate.kind)].label : undefined}
                      onClick={() => setNodeId(n.id)}
                    />
                  ))}
                </div>
              )}
              {selectedNode && (
                <p className="text-xs text-gray-500 mt-1.5 font-mono truncate">{selectedNode.address}</p>
              )}
            </div>

            {selectedTemplate && editor.env.length > 0 && (
              <div className="border-t border-white/10 pt-4 mt-4">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Environment Variables</h4>
                    <p className="text-xs text-gray-500">Provide the values for this deployment. Required vars are flagged; defaults from the template are pre-filled</p>
                  </div>
                  <span className="text-[10px] text-emerald-300/80 border border-emerald-700/40 bg-emerald-950/30 rounded px-1.5 py-0.5 shrink-0">
                    {editor.env.length} variable{editor.env.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-3">
                  {editor.env
                    .filter((v) => v.name && (v.user_editable || v.required))
                    .map((v, idx) => {
                      const val = envValues[v.name] ?? '';
                      const opts = (v.options || '').split(',').map((o) => o.trim()).filter(Boolean);
                      const missing = !!v.required && (val === undefined || val === '');
                      return (
                        <div key={(v.name || 'var') + ':' + idx} className="border border-white/10 rounded-md p-3 space-y-1.5 bg-black/30">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-emerald-300">{v.name}</span>
                            {v.label && <span className="text-xs text-gray-300">— {v.label}</span>}
                            {v.required && <span className="text-[10px] text-red-300 uppercase tracking-wide">required</span>}
                            {v.display && <span className="text-[10px] text-gray-500 uppercase tracking-wide">{v.display}</span>}
                            {v.rule && <span className="text-[10px] text-gray-500 font-mono" title="Validation rule (regex)">rule: {v.rule}</span>}
                          </div>
                          {v.description && <p className="text-[11px] text-gray-500">{v.description}</p>}
                          {v.display === 'select' && opts.length > 0 ? (
                            <select value={val} onChange={(e) => setEnvValues((m) => ({ ...m, [v.name]: e.target.value }))} className={monoCls + (missing ? ' border-red-700/40' : '')}>
                              {!v.required && <option value="">— none —</option>}
                              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : v.display === 'checkbox' ? (
                            <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                              <input type="checkbox" checked={val === 'true' || val === '1' || val === 'on'} onChange={(e) => setEnvValues((m) => ({ ...m, [v.name]: e.target.checked ? 'true' : 'false' }))} />
                              enable
                            </label>
                          ) : v.display === 'number' ? (
                            <input type="number" inputMode="numeric" step="any" value={val} onChange={(e) => setEnvValues((m) => ({ ...m, [v.name]: e.target.value }))} placeholder={v.default ? `default: ${v.default}` : 'number'} className={monoCls + (missing ? ' border-red-700/40' : '')} />
                          ) : (
                            <input value={val} onChange={(e) => setEnvValues((m) => ({ ...m, [v.name]: e.target.value }))} placeholder={v.default ? `default: ${v.default}` : '(no default)'} className={monoCls + (missing ? ' border-red-700/40' : '')} />
                          )}
                        </div>
                      );
                    })}
                </div>
                {editor.env.filter((v) => v.name && (v.user_editable || v.required)).length === 0 && (
                  <p className="text-xs text-gray-500">This template defines no editable or required environment variables</p>
                )}
              </div>
            )}

{selectedTemplate && (
              <div className="border-t border-white/10 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => navigate('/instances/new/advanced')}
                  className="ks-ghost-btn w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 text-gray-300">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M9 9h6v6H9z" />
                    </svg>
                    <div className="text-left min-w-0">
                      <div className="text-sm font-medium text-gray-100">Advance Option</div>
                      <div className="text-xs text-gray-500">Open a separate page to override environment, install, runtime, labels, healthcheck, pages and inspect the generated spec</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide shrink-0">Open</span>
                </button>
              </div>
            )}

      </div>
    </FormPage>
  );
};

export default InstanceForm;
