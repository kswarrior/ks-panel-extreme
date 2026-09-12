import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNodes, listTemplates, listUsers, listRoles, deployInstance } from '@/shared/api/admin';
import type { DeployRequest } from '@/shared/types/instance';
import FormPage from '@/shared/components/forms/FormPage';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageFormActionsPill from '@/shared/components/ui/PageFormActionsPill';
import PillHistoryControls from '@/shared/components/ui/PillHistoryControls';
import { useFormHistory } from '@/shared/hooks/useFormHistory';
import GlassCard from '@/shared/components/ui/Card';
import GlassModal from '@/shared/components/ui/Modal';
import { SearchableSelect, type SearchableOption } from '@/shared/components/ui/SearchableSelect';
import { Icons as SidebarIcons } from '@/shared/components/layout/Sidebar';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { parseEnvOptions, checkboxChecked, checkboxValues } from '@/features/templates/types/templateForm';
import {
  KindIcon,
} from '../components/InstanceFormComponents';
import { TemplateTabs } from '@/features/templates/components/TemplateFormComponents';
import { TEMPLATE_TABS } from '@/features/templates/types/templateForm';
import InstanceAdvancedTabContent from '../components/InstanceAdvancedTabContent';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';
import { useDeployForm } from '../stores/deployFormStore';
import { KIND_META, ICON_PRESETS, COLOR_SWATCHES, driverEnabled, kindKey } from '../types/instanceForm';
import { buildOverrides, parseTemplateImages, serializeEditor } from '../utils/instanceFormUtils';
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
    editor, setEditor,
    envValues,
    setEnvValues,
    imageKey, setImageKey,
    baseline,
    nodes, setNodes,
    templates, setTemplates,
    users, setUsers,
    roles, setRoles,
    loading, setLoading,
    deploying, setDeploying,
    error, setError,
    tab, setTab,
  } = useDeployForm();

  // Session edit history over the deploy fields (option lists, tab and the
  // derived diff baseline stay out). Deploy is create-only: no server
  // state to reload, so Refresh reverts to the blank form. History is
  // per-view: switching to the Advance route remounts with a fresh stack.
  const snapshot = JSON.stringify({ templateId, nodeId, ownerId, name, displayName, icon, color, editor, envValues, imageKey });
  const hist = useFormHistory(snapshot, (snapStr) => {
    const s = JSON.parse(snapStr);
    setTemplateId(s.templateId);
    setNodeId(s.nodeId);
    setOwnerId(s.ownerId);
    setName(s.name);
    setDisplayName(s.displayName);
    setIcon(s.icon);
    setColor(s.color);
    setEditor(s.editor);
    setEnvValues(s.envValues);
    setImageKey(s.imageKey);
  });
  const { suspend: histSuspend } = hist;

  const load = useCallback(async () => {
    histSuspend();
    setError('');
    try {
      const [ns, ts, us, rs] = await Promise.all([listNodes(), listTemplates(), listUsers(), listRoles()]);
      setNodes(ns);
      setTemplates(ts);
      setUsers(us);
      setRoles(rs);
      setOwnerId(us[0]?.id || 0);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [setNodes, setTemplates, setUsers, setRoles, setOwnerId, setError, setLoading, histSuspend]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectTemplate = (tid: number) => {
    setTemplateId(tid);
  };

  const roleForId = (id: number) => roles.find((r) => r.id === id);

  // Derived selections — plain values (not hooks), kept above every
  // row-renderer so closures like renderNodeRow never read them from TDZ.
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedNode = nodes.find((n) => n.id === nodeId);
  const selectedOwner = users.find((u) => u.id === ownerId);
  const driverMissing = selectedTemplate && selectedNode && !driverEnabled(selectedNode, kindKey(selectedTemplate.kind));

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
    const selImg = (imageKey.trim() !== '' ? imageKey.trim() : (imageOptions.find((o) => o.isDefault)?.name || '')).toLowerCase();
    for (const v of editor.env) {
      if (!v.name) continue;
      if ((v as any).behavior === 'auto') continue;
      const imgs = Array.isArray((v as any).images) ? ((v as any).images as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean) : [];
      if (imageOptions.length > 0 && imgs.length > 0 && !imgs.some((n) => n.toLowerCase() === selImg)) continue;
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
      ...(imageKey.trim() ? { image_key: imageKey.trim() } : {}),
    };
    try {
      const created = await deployInstance(payload);
      hist.commit();
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

  // NOTE: every hook must run before ANY early return. These two useMemo
  // calls used to sit after the `if (loading) return` below, so the
  // first render (loading=true) ran fewer hooks than the next one
  // (loading=false) — React error #310 ("Rendered more hooks than during
  // the previous render") which crashed /instances/new on every load.
  // Named runtimes from the template's multi-image map. Empty = the
  // template is single-image (only the top-level image is deployed).
  const imageOptions = useMemo(
    () => (selectedTemplate ? parseTemplateImages(selectedTemplate.spec, selectedTemplate.image) : []),
    [selectedTemplate],
  );
  // '' means "template default" — highlight the flagged row.
  const effectiveImageKey = imageKey.trim() !== ''
    ? imageKey.trim()
    : (imageOptions.find((o) => o.isDefault)?.name || '');
  // Env vars visible for this runtime: hidden auto-sets never prompt (they
  // are applied server-side with the default), and image-scoped vars only
  // show when the selected runtime matches (empty = All images).
  const visibleEnvVars = useMemo(() => {
    const sel = effectiveImageKey.trim().toLowerCase();
    return editor.env.filter((v) => {
      if (!v.name || !(v.user_editable || v.required)) return false;
      if ((v as any).behavior === 'auto') return false;
      const imgs = Array.isArray((v as any).images) ? (v as any).images as unknown[] : [];
      const list = imgs.map((x) => String(x ?? '').trim()).filter(Boolean);
      if (imageOptions.length > 0 && list.length > 0 && !list.some((n) => n.toLowerCase() === sel)) return false;
      return true;
    });
  }, [editor.env, effectiveImageKey, imageOptions.length]);

  // Icon editor lives in a modal (Mods → Install Mod pattern). The General
  // card only shows the live preview + a small edit button.
  const [iconModalOpen, setIconModalOpen] = useState(false);

  // Spec preview + template ref for the advanced tabs (same source the
  // standalone Advance Option page used — now rendered inline).
  const specPreview = useMemo(() => JSON.stringify(serializeEditor(editor), null, 2), [editor]);
  const advSelectedTemplate = useMemo(() => {
    const t = templates.find((x) => x.id === templateId) ?? null;
    return t ? { image: t.image, kind: t.kind } : null;
  }, [templates, templateId]);

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Deploy Instance' }]}
        hideHeader
        maxWidth="max-w-4xl"
      >
        <FormSkeleton fields={5} />
      </FormPage>
    );
  }

  return (
    <>
      {/* Bottom-right form actions — undo / redo + Deploy;
          fixed, auto-hide on scroll (node pattern).
          Corner-anchored (right-4, w-auto) so the phone Tabs pill shares
          the same bottom line on the left instead of floating above with
          an empty gap underneath (no ks-tabs-pill-wrap lift). */}
      <PageFormActionsPill
        spacer={false}
        outerClassName="fixed right-4 sm:right-6 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-end w-auto max-w-[calc(100vw-2rem)]"
      >
          <PillHistoryControls hist={hist} />
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
      </PageFormActionsPill>
    <FormPage
      crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Deploy Instance' }]}
      onSubmit={submit}
      maxWidth="max-w-4xl"
      hideHeader
    >
      {error && (
        <GlassCard className="border-red-600/40 bg-red-950/30 mb-4">
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
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-700/30 rounded-md px-3 py-2 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 shrink-0">
            <path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" />
           </svg>
          Selected node <span className="font-medium text-amber-200">{selectedNode?.name}</span> doesn't advertise the
          {' '}{kindKey(selectedTemplate!.kind)} driver — deploy may fail. Enable the driver on that edge or pick another node.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4">
        {/* Phone tabs sit bottom-LEFT on the same bottom line as the Deploy
            actions (bottom-right) — corner-anchored w-auto with no
            ks-tabs-pill-wrap class, so the global "lift above the form bar"
            rule never applies and no empty gap is left underneath. */}
        <TemplateTabs
          tab={tab}
          onChange={setTab}
          tabs={TEMPLATE_TABS}
          tabsPillOuterClassName="lg:hidden fixed left-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-start w-auto max-w-[calc(100vw-2rem)] ks-tabs-pill-wrap-below"
        />
        <div className="space-y-6 mt-2 min-w-0 max-w-full">
          {tab === 'general' && (
          <>
        <GlassCard variant="form" className="">
            <div className="mb-1">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">General</h3>
              <p className="text-xs text-gray-500">Icon, names, owner, node and template — everything the deployment runs on.</p>
            </div>

            {/* Row 1 — [ icon ] { display name } on one line */}
            <div className="flex items-end gap-3">
              <div className="shrink-0">
                <span className={labelCls}>Icon</span>
                <button
                  type="button"
                  onClick={() => setIconModalOpen(true)}
                  title="Edit icon & colour"
                  aria-label="Edit icon & colour"
                  className="relative block w-12 h-12 rounded-lg border bg-white/[0.05] border-white/10 hover:border-white/30 transition-colors"
                  style={color ? { color } : undefined}
                >
                  <span className="w-full h-full flex items-center justify-center" aria-hidden="true">
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
                  <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center border border-white/20 bg-neutral-800 text-gray-200">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </span>
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <label className={labelCls}>Display name <span className="text-xs text-gray-500 font-normal">(optional)</span></label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={glassFieldClass}
                  placeholder={(displayName.trim() || name.trim()) || 'New instance'}
                />
              </div>
            </div>

            {/* Row 2 — Name + Owner aligned on one line */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="min-w-0">
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
              <div className="min-w-0">
                <label className={`${labelCls} flex items-center gap-1.5`}>
                  <span className="text-gray-400 inline-flex [&>svg]:w-3.5 [&>svg]:h-3.5" aria-hidden="true">{SidebarIcons.Users}</span>
                  Owner
                </label>
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
                    leadingIcon={SidebarIcons.Users}
                  />
                )}
                {selectedOwner && (
                  <p className="text-xs text-gray-500 mt-1.5 truncate">
                    {selectedOwner.email || 'no email'}
                  </p>
                )}
              </div>
            </div>
            </GlassCard>
            <GlassCard variant="form">
            {/* Row 3 — Template + Node aligned on one line, image preview below */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                      <span className="text-gray-400 inline-flex [&>svg]:w-3.5 [&>svg]:h-3.5" aria-hidden="true">{SidebarIcons.Templates}</span>
                      Template
                    </h4>
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
                    leadingIcon={SidebarIcons.Templates}
                  />
                )}
                {selectedTemplate && (
                  <p className="text-xs text-gray-500 mt-1.5 font-mono truncate" title={imageOptions.find((o) => o.name.toLowerCase() === effectiveImageKey.toLowerCase())?.image || selectedTemplate.image}>
                    {imageOptions.find((o) => o.name.toLowerCase() === effectiveImageKey.toLowerCase())?.image || selectedTemplate.image}
                  </p>
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
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                      <span className="text-gray-400 inline-flex [&>svg]:w-3.5 [&>svg]:h-3.5" aria-hidden="true">{SidebarIcons.Nodes}</span>
                      Node
                    </h4>
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
                    leadingIcon={SidebarIcons.Nodes}
                  />
                )}
                {selectedNode && (
                  <p className="text-xs text-gray-500 mt-1.5 font-mono truncate">{selectedNode.address}</p>
                )}
              </div>
            </div>
            </GlassCard>

            {selectedTemplate && imageOptions.length > 0 && (
              <GlassCard variant="form">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Runtime Image</h4>
                    <p className="text-xs text-gray-500">This template ships {imageOptions.length} named runtimes — pick the one for this deployment.</p>
                  </div>
                  <span className="text-[10px] text-sky-300/80 border border-sky-700/40 bg-sky-950/30 rounded px-1.5 py-0.5 shrink-0">
                    {imageOptions.length} runtime{imageOptions.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div role="radiogroup" aria-label="Runtime image" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {imageOptions.map((o) => {
                    const selected = effectiveImageKey.toLowerCase() === o.name.toLowerCase();
                    return (
                      <button
                        key={o.name}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setImageKey(o.isDefault ? '' : o.name)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md border text-left transition-colors ${selected ? 'border-sky-400/60 bg-sky-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}
                      >
                        <span className={`w-2 h-2 shrink-0 rounded-full ${selected ? 'bg-sky-300' : 'bg-gray-600'}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-xs text-gray-100 truncate">{o.name}</span>
                            {o.isDefault && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-amber-700/60 bg-amber-950/40 text-amber-200">default</span>
                            )}
                          </span>
                          <code className="block text-[10px] text-gray-500 font-mono truncate" title={o.image}>{o.image}</code>
                          {o.description && <span className="block text-[11px] text-gray-500 truncate">{o.description}</span>}
                        </span>
                        {selected && <span className="text-sky-300 text-xs shrink-0">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              </GlassCard>
            )}

            {selectedTemplate && editor.env.length > 0 && (
              <GlassCard variant="form">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Environment Variables</h4>
                    <p className="text-xs text-gray-500">Provide the values for this deployment. Required vars are flagged; defaults from the template are pre-filled</p>
                  </div>
                  <span className="text-[10px] text-emerald-300/80 border border-emerald-700/40 bg-emerald-950/30 rounded px-1.5 py-0.5 shrink-0">
                    {visibleEnvVars.length} variable{visibleEnvVars.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-3">
                  {visibleEnvVars
                    .map((v, idx) => {
                      const val = envValues[v.name] ?? '';
                      const rows = parseEnvOptions(v);
                      const [cbOn, cbOff] = checkboxValues(v);
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
                          {v.display === 'select' && rows.length > 0 ? (
                            <div role="radiogroup" aria-label={v.label || v.name} className="space-y-1.5">
                              {!v.required && (
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={val === ''}
                                  onClick={() => setEnvValues((m) => ({ ...m, [v.name]: '' }))}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md border text-left transition-colors ${val === '' ? 'border-sky-400/60 bg-sky-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}
                                >
                                  <span className="text-xs text-gray-400">— none —</span>
                                </button>
                              )}
                              {rows.map((o, j) => {
                                const selected = val === o.value;
                                return (
                                  <button
                                    key={`${o.value}:${j}`}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setEnvValues((m) => ({ ...m, [v.name]: o.value }))}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md border text-left transition-colors ${selected ? 'border-sky-400/60 bg-sky-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}
                                  >
                                    {o.svg.trim() !== '' ? (
                                      <span
                                        className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-gray-200 [&>svg]:w-5 [&>svg]:h-5 [&>svg]:block"
                                        aria-hidden="true"
                                        dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(o.svg) }}
                                      />
                                    ) : (
                                      <span className={`w-2 h-2 shrink-0 rounded-full ${selected ? 'bg-sky-300' : 'bg-gray-600'}`} aria-hidden="true" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-xs text-gray-100 truncate">{o.label || o.value}</span>
                                      {o.label && <code className="block text-[10px] text-gray-500 font-mono truncate">{o.value}</code>}
                                    </span>
                                    {selected && <span className="text-sky-300 text-xs shrink-0">✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          ) : v.display === 'checkbox' ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={checkboxChecked(v, val)}
                              onClick={() => setEnvValues((m) => ({ ...m, [v.name]: checkboxChecked(v, envValues[v.name] ?? '') ? cbOff : cbOn }))}
                              className="flex items-center gap-2.5 text-xs text-gray-300"
                              title={checkboxChecked(v, val) ? `On → ${cbOn}` : `Off → ${cbOff}`}
                            >
                              <span className={`relative w-9 h-5 rounded-full transition shrink-0 ${checkboxChecked(v, val) ? 'bg-green-600' : 'bg-neutral-700'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${checkboxChecked(v, val) ? 'translate-x-4' : ''}`} />
                              </span>
                              <span className="font-mono text-[11px] text-gray-400">{checkboxChecked(v, val) ? cbOn : cbOff}</span>
                            </button>
                          ) : v.display === 'number' ? (
                            <input type="number" inputMode="numeric" step="any" value={val} onChange={(e) => setEnvValues((m) => ({ ...m, [v.name]: e.target.value }))} placeholder={v.default ? `default: ${v.default}` : 'number'} className={monoCls + (missing ? ' border-red-700/40' : '')} />
                          ) : (
                            <input value={val} onChange={(e) => setEnvValues((m) => ({ ...m, [v.name]: e.target.value }))} placeholder={v.default ? `default: ${v.default}` : '(no default)'} className={monoCls + (missing ? ' border-red-700/40' : '')} />
                          )}
                        </div>
                      );
                    })}
                </div>
                {visibleEnvVars.length === 0 && (
                  <p className="text-xs text-gray-500">This template defines no editable or required environment variables{imageOptions.length > 0 ? ' for the selected runtime' : ''}</p>
                )}
              </div>
              </GlassCard>
            )}

          </>
          )}
          {tab !== 'general' && (
            <InstanceAdvancedTabContent selectedTemplate={advSelectedTemplate} specPreview={specPreview} />
          )}
        </div>
      </div>
    </FormPage>
      {/* Spacer — single bottom-pill row clearance (tabs left + Deploy
          right share one line, node/template pattern). */}
      <div aria-hidden="true" className="h-20 lg:hidden" />

      {/* ---- Icon & colour sub-page (Mods → Install Mod modal pattern) ---- */}
      <GlassModal
        open={iconModalOpen}
        onClose={() => setIconModalOpen(false)}
        title="Icon & colour"
        maxWidth="max-w-lg"
        footer={
          <>
            <button onClick={() => setIconModalOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
            <button onClick={() => setIconModalOpen(false)} className="ks-btn-form ks-btn-primary">Done</button>
          </>
        }
      >
        <div className="flex items-center gap-3">
          <span
            className="w-12 h-12 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 shrink-0"
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
          <p className="text-xs text-gray-500">Live preview — pick a preset or paste custom SVG below.</p>
        </div>
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
      </GlassModal>
    </>
  );
};

export default InstanceForm;
