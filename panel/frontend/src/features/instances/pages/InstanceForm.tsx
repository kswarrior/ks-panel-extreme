import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNodes, listTemplates, listUsers, listRoles, deployInstance } from '@/shared/api/admin';
import type { DeployRequest } from '@/shared/types/instance';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import GlassCard from '@/shared/components/ui/Card';
import { SearchableSelect, type SearchableOption } from '@/shared/components/ui/SearchableSelect';
import { glassFieldClass } from '@/shared/components/ui/Field';
import {
  KindIcon,
} from '../components/InstanceFormComponents';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';
import { useDeployForm } from '../stores/deployFormStore';
import { KIND_META, ICON_PRESETS, COLOR_SWATCHES, driverEnabled, kindKey } from '../types/instanceForm';
import { buildOverrides } from '../utils/instanceFormUtils';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

const monoCls = glassFieldClass + ' font-mono ks-input-mono';
const labelCls = 'block text-sm font-medium text-gray-300 mb-1 ks-label';

const InstanceForm: React.FC = () => {
  const navigate = useNavigate();
  const {
    templateId, setTemplateId,
    nodeId, setNodeId,
    ownerId, setOwnerId,
    name, setName,
    displayName, setDisplayName,
    icon, setIcon,
    color, setColor,
    editor,
    envValues,
    setEnvValues,
    baseline,
    nodes, setNodes,
    templates, setTemplates,
    users, setUsers,
    roles, setRoles,
    loading, setLoading,
    deploying, setDeploying,
    error, setError,
  } = useDeployForm();

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
  }, [setNodes, setTemplates, setUsers, setRoles, setOwnerId, setError, setLoading]);

  const selectTemplate = (tid: number) => {
    setTemplateId(tid);
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

  const renderOwnerRow = (opt: SearchableOption<number>, active: boolean) => {    const u = users.find((x) => x.id === opt.value);
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

  const templateOptions: SearchableOption<number>[] = useMemo(() => templates.map((t) => {
    const k = kindKey(t.kind);
    return {
      value: t.id,
      label: t.name,
      description: t.image || t.description || '',
      keywords: `${t.name} ${k} ${t.image || ''} ${t.description || ''}`,
      badge: KIND_META[k]?.label ?? k,
    };
  }), [templates]);

  const renderTemplateRow = (opt: SearchableOption<number>, active: boolean) => {
    const t = templates.find((x) => x.id === opt.value);
    if (!t) return <span className="truncate">{opt.label}</span>;
    const k = kindKey(t.kind);
    const meta = KIND_META[k];
    return (
      <div className="flex items-center gap-2.5">
        <div className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center border ${meta.badge}`}>
          <KindIcon kind={k} className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm truncate ${active ? 'text-white' : 'text-gray-200'}`}>{t.name}</span>
            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${meta.badge}`}>{meta.label}</span>
          </div>
          <p className="text-xs text-gray-500 truncate font-mono" title={t.image}>{t.image}</p>
        </div>
      </div>
    );
  };

  const nodeState = (n: { state?: string; status?: string }) =>
    n.state || (n.status === 'up' ? 'up' : 'down');

  const nodeOptions: SearchableOption<number>[] = useMemo(() => nodes.map((n) => {
    const state = nodeState(n);
    return {
      value: n.id,
      label: n.name,
      description: n.address || '',
      keywords: `${n.name} ${n.address || ''} ${state}`,
      badge: state,
    };
  }), [nodes]);

  const renderNodeRow = (opt: SearchableOption<number>, active: boolean) => {
    const n = nodes.find((x) => x.id === opt.value);
    if (!n) return <span className="truncate">{opt.label}</span>;
    const state = nodeState(n);
    const dot = state === 'up' ? 'bg-emerald-400' : state === 'partial' ? 'bg-amber-400' : state === 'pending' ? 'bg-gray-400' : 'bg-red-400';
    const incompatible = selectedTemplate && !driverEnabled(n, kindKey(selectedTemplate.kind));
    return (
      <div className="flex items-center gap-2.5">
        <span className={`shrink-0 w-2 h-2 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm truncate ${active ? 'text-white' : 'text-gray-200'}`}>{n.name}</span>
            {incompatible && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-amber-700/60 bg-amber-950/40 text-amber-200">
                missing {KIND_META[kindKey(selectedTemplate!.kind)].label} driver
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate font-mono">{n.address}</p>
        </div>
      </div>
    );
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
      const created = await deployInstance(payload);
      // Jump straight to the new instance's home page: while status is
      // "creating"/"installing" it renders the live install banner
      // (per-step transcript), so the operator watches the install log
      // instead of landing back on a static list.
      navigate(created?.id ? `/instances/${created.id}` : '/instances');
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
        hideHeader
        maxWidth="max-w-3xl"
      >
        <FormSkeleton fields={5} />
      </FormPage>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedNode = nodes.find((n) => n.id === nodeId);
  const selectedOwner = users.find((u) => u.id === ownerId);
  const driverMissing = selectedTemplate && selectedNode && !driverEnabled(selectedNode, kindKey(selectedTemplate.kind));

  return (
    <>
      {/* Top-right actions — fixed, auto-hide on scroll (node pattern).
          Footer Deploy removed; everything lives here. */}
      <PageActionsPill>
          <button
            type="button"
            onClick={() => navigate('/instances')}
            title="Cancel and back to Instances"
            aria-label="Cancel and back to Instances"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={deploying}
            title="Deploy instance"
            className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {deploying ? 'Deploying…' : 'Deploy'}
          </button>
      </PageActionsPill>
    <FormPage
      crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Deploy Instance' }]}
      onSubmit={submit}
      maxWidth="max-w-3xl"
      hideHeader
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

        <GlassCard variant="form" className="">
            <div className="mb-1">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">General</h3>
              <p className="text-xs text-gray-500">Name, owner, node and template — everything the deployment runs on.</p>
            </div>

            <div className="ks-card ks-form-card rounded-md p-3 space-y-3">
              <p className="text-sm text-gray-200 font-medium">Icon &amp; colour</p>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 shrink-0" title="Card preview">
                  <span
                    className="w-12 h-12 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10"
                    style={color ? { color } : undefined}
                    aria-hidden="true"
                  >
                    {icon ? (
                      <span
                        className="w-6 h-6 block [&>svg]:w-6 [&>svg]:h-6 [&>svg]:block"
                        dangerouslySetInnerHTML={{ __html: icon.replace(/<svg /, '<svg width="24" height="24" ') }}
                      />
                    ) : selectedTemplate ? (
                      <KindIcon kind={kindKey(selectedTemplate.kind)} className="w-6 h-6" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                    )}
                  </span>
                  <span className="text-[11px] text-gray-500 max-w-[4.5rem] truncate">{(displayName.trim() || name.trim()) || 'Instance'}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <span className="block text-sm font-medium text-gray-200 mb-1">Icon</span>
                    <div className="flex gap-2 overflow-x-auto ks-hscroll pb-2 -mx-0.5 px-0.5">
                      {ICON_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setIcon(p.svg)}
                          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${icon === p.svg ? 'border-sky-400/60 bg-sky-500/15' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                          title={p.label}
                        >
                          {p.svg && (
                            <span dangerouslySetInnerHTML={{ __html: p.svg.replace(/<svg /, '<svg width="16" height="16" ') }} />
                          )}
                          <span className="text-xs text-gray-300">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="block text-sm font-medium text-gray-200 mb-1">Colour</span>
                    <div className="flex gap-2 overflow-x-auto ks-hscroll pb-2 -mx-0.5 px-0.5">
                      {COLOR_SWATCHES.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setColor(c.value)}
                          className={`shrink-0 w-8 h-8 rounded-lg border transition-transform ${color === c.value && c.value ? 'border-white scale-105' : color === c.value && !c.value ? 'border-white/50' : 'border-white/10 hover:border-white/30'}`}
                          style={{ backgroundColor: c.value || 'transparent' }}
                          title={c.label}
                        >
                          {color === c.value && (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-5 h-5 m-auto"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className={glassFieldClass}
                placeholder="Paste custom SVG or pick a preset above"
              />
              <input
                type="color"
                value={color || '#a78bfa'}
                onChange={(e) => setColor(e.target.value)}
                className="w-full h-10 rounded-lg border border-white/10 cursor-pointer"
              />
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
            <div className="border-t border-white/10 pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="min-w-0">
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
                  <SearchableSelect<number>
                    options={templateOptions}
                    value={templateId}
                    onChange={selectTemplate}
                    placeholder="Search templates by name, kind or image…"
                    emptyMessage="No templates match"
                    renderRow={renderTemplateRow}
                    groupLabel="Templates"
                  />
                )}
                {selectedTemplate && (
                  <p className="text-xs text-gray-500 mt-1.5 font-mono truncate">{selectedTemplate.image}</p>
                )}
                {!selectedTemplate && (
                  <p className="text-xs text-amber-200/90 bg-amber-950/30 border border-amber-700/30 rounded-md px-3 py-2 mt-3">
                    Choose a template first — its configuration appears on the other tabs.
                  </p>
                )}
              </div>

              <div className="min-w-0">
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
                  <SearchableSelect<number>
                    options={nodeOptions}
                    value={nodeId}
                    onChange={setNodeId}
                    placeholder="Search nodes by name or address…"
                    emptyMessage="No nodes match"
                    renderRow={renderNodeRow}
                    groupLabel="Nodes"
                  />
                )}
                {selectedNode && (
                  <p className="text-xs text-gray-500 mt-1.5 font-mono truncate">{selectedNode.address}</p>
                )}
              </div>
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
                              <input type="checkbox" className="ks-checkbox" checked={val === 'true' || val === '1' || val === 'on'} onChange={(e) => setEnvValues((m) => ({ ...m, [v.name]: e.target.checked ? 'true' : 'false' }))} />
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
    </>
  );
};

export default InstanceForm;
