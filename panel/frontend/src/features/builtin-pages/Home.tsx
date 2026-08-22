// Home instance sub-page — built-in page implementation (self-contained).
//
// Renders the instance overview: identity header, resource + disk stat
// cards (HomeCard), the post-deploy install banner (InstallBanner), and
// the per-template one-click actions card (ActionsCard). Moved verbatim
// from the legacy pages/panel/InstanceDetail.tsx monolith; the cross-page
// UI vocabulary (parseBytes, statusMeta, KindIcon, Section/InfoRow,
// useInstanceFromParams, LoadingOrError, …) is imported from ./_shared so
// the same helpers aren't duplicated across the built-in instance pages.
//
// Default export is the BuiltinPageManifestEntry consumed by
// lib/builtin/index.ts (picker ordering, sidebar icon registry, dynamic
// page resolution). pages/panel/InstanceDetail.tsx is now a thin facade
// that re-exports InstanceHome + its boundary-wrapped <InstanceHomePage/>.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInstance, parseConfig, extractConfig } from '@/shared/hooks/useInstance';
import type { Instance, DriverKind } from '@/shared/types/instance';
import { listTemplates } from '@/shared/api/admin';
import { invokeInstanceAction, stopInstanceAction, getMetrics } from '@/features/instances/api/instanceAdvanced';
import type { MetricsSnapshot } from '@/shared/types/instanceAdvanced';
import { formatBytes } from '@/features/instances/components/InstanceCard';
import axios from 'axios';
import {
  parseBytes, joinPath, timeAgo,
  KIND_BADGE, kindBadgeClass, STATUS_META, statusMeta, KindIcon,
  cleanExternalId, INSTANCE_NAV,
  Section, EmptyRow, InfoRow, inputCls, Btn, Field,
  useInstanceFromParams, PageErrorBoundary, withBoundary,
  LoadingOrError, TableSkeleton, CardGridSkeleton, TilesSkeleton,
  asArray, errText,
} from './_shared';
import type { LoadingKind } from './_shared';
import type { BuiltinPageManifestEntry } from './types';

// ----- subpages --------------------------------------------------------------

// HomeCard is the per-instance analogue of the dashboard's StatCard: a glass
// tile with an icon badge and a "label / value / hint" stack. Keeping the
// shape symmetric makes the home page read like the dashboard at a glance.
const HomeCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
  accent?: string;
}> = ({ label, value, hint, icon, accent = 'text-white' }) => (
  <div className="glass-card rounded-xl flex items-center gap-4 animate-slide-up">
    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 bg-white/5 ${accent}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-lg font-semibold text-white leading-tight truncate">{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wide truncate">{label}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{hint}</div>}
    </div>
  </div>
);

// InstallBanner renders the Flow-2 (post-deploy install workflow) state on
// the instance Home page. installSweepLoop polls /api/edge/install every ~2s
// and writes install_state/install_step/install_error/install_steps_json on
// the instance row; this banner decodes the steps transcript and shows a
// per-step checklist (pending/running/done/skipped/nonfatal/failed) with the
// failing step's stderr collapsed under it.
//
// State values mirror internal/install: "", "running", "done", "failed".
// Per-step status values: "pending" | "running" | "done" | "skipped" |
// "nonfatal" | "failed".
interface InstallStepStatusUI {
  index: number;
  action: string;
  status: string;
  attempt?: number;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  started_at?: string;
  ended_at?: string;
}
const InstallBanner: React.FC<{
  state: '' | 'running' | 'done' | 'failed';
  step: number;
  error: string;
  stepsJSON: string;
}> = ({ state, step, error, stepsJSON }) => {
  const steps: InstallStepStatusUI[] = React.useMemo(() => {
    if (!stepsJSON) return [];
    try {
      const parsed = JSON.parse(stepsJSON);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [stepsJSON]);

  const isRunning = state === 'running';
  const isFailed = state === 'failed';
  const total = steps.length;
  // The current step index from installSweepLoop; -1 means "not started"
  // and "unknown" once the workflow finished.
  const curIdx = step >= 0 ? step : -1;

  const stepVisual = (st: string): { dot: string; label: string; text: string } => {
    switch (st) {
      case 'done':
        return { dot: 'bg-emerald-400', label: 'done', text: 'text-emerald-300' };
      case 'running':
        return { dot: 'bg-sky-400 animate-pulse', label: 'running', text: 'text-sky-300' };
      case 'skipped':
      case 'nonfatal':
        return { dot: 'bg-amber-400', label: st, text: 'text-amber-300' };
      case 'failed':
        return { dot: 'bg-red-400', label: 'failed', text: 'text-red-300' };
      default:
        return { dot: 'bg-gray-600', label: 'pending', text: 'text-gray-400' };
    }
  };

  return (
    <div
      className={`glass-card rounded-xl animate-fade-in border ${
        isFailed ? 'border-red-800/50' : 'border-sky-800/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 shrink-0 ${isFailed ? 'text-red-300' : 'text-sky-300'} ${isRunning ? 'animate-spin' : ''}`}>
          <path d="M21 12a9 9 0 1 1-6.2-8.5" />
         </svg>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold ${isFailed ? 'text-red-200' : 'text-sky-200'}`}>
            {isFailed ? 'Install workflow failed' : isRunning ? 'Installing…' : 'Install workflow'}
            {total > 0 && (
              <span className="ml-2 text-xs text-gray-400 font-mono">
                {curIdx >= 0 ? `step ${curIdx + 1}/${total}` : `${total} step${total === 1 ? '' : 's'}`}
              </span>
            )}
          </div>
          {isFailed && error ? (
            <p className="text-xs text-red-300 font-mono mt-1 break-all">{error}</p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {isRunning
                ? 'The edge is running the template install steps inside the container. The instance flips to Running once they finish.'
                : 'Install workflow tracking for this instance.'}
            </p>
          )}
        </div>
      </div>

      {total > 0 && (
        <ul className="mt-3 space-y-1.5">
          {steps.map((s) => {
            const v = stepVisual(s.status);
            return (
              <li key={s.index} className="flex items-start gap-2 text-xs">
                <span className={`mt-1 shrink-0 w-2 h-2 rounded-full ${v.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-gray-300">#{s.index + 1}</span>
                    <span className="text-gray-200">{s.action || 'step'}</span>
                    <span className={`text-[10px] uppercase tracking-wide ${v.text}`}>{v.label}</span>
                    {typeof s.exit_code === 'number' && s.exit_code !== 0 && (
                      <span className="text-[10px] text-gray-500 font-mono">exit {s.exit_code}</span>
                    )}
                  </div>
                  {/* Surface the failing step's first stderr line, kept short
                      for the same reason the instance row's install_error is —
                      the full transcript goes to the activity log. */}
                  {s.status === 'failed' && s.stderr && (
                    <pre className="mt-1 text-[10px] text-red-300 font-mono whitespace-pre-wrap break-all bg-red-900/20 border border-red-900/30 rounded px-1.5 py-1">
                      {s.stderr.split('\n').filter(Boolean).slice(0, 4).join('\n')}
                    </pre>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// Minimal shape of a template's spec.actions[] entry the home-page Actions
// card has to consume to render its buttons. We mirror only the fields
// actually read here — Id/Name/Description + the per-flag metadata we surface
// as button subtitles ("auto-start", "auto-stop-on-exit", "restart-on-crash").
// The full set lives in TemplateForm (the editor) and matches the panel-side
// templateActionSpec struct in instance_handler.go.
interface HomeTemplateAction {
  id: string;
  name: string;
  description?: string;
  auto_start_instance?: boolean;
  auto_stop_on_exit?: boolean;
  restart_on_failure?: boolean;
  user_invokable?: boolean;
  stop_command?: string;
  stop_mode?: 'same' | 'different';
  steps?: unknown[];
}

// ActionsCard renders every spec.actions[] entry on the instance home page
// as a labelled button. Clicking invokes the post to the panel's
// /api/instances/{id}/actions/{actionId}/invoke route; the panel proxies
// through the edge install-workflow engine and tracks the action's
// progress through install_state/install_steps_json (so the existing
// InstallBanner lights up while the action runs). On action completion the
// panel's installSweepLoop applies the action's auto_stop_on_exit flag.
//
// Buttons are disabled while an install/action workflow is in flight (the
// edge install record key is shared between install and action workflows,
// so a second concurrent invocation would 409 at the edge). The card
// re-fetches the instance row after each click so the UI flips to "running"
// immediately (invoke_path already set the row to install_state='running').
interface TemplateInfo {
  Template: Awaited<ReturnType<typeof listTemplates>>[number];
}
const ActionsCard: React.FC<{ instanceId: number; templateId: number }> = ({ instanceId, templateId }) => {
  const [actions, setActions] = useState<HomeTemplateAction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { instance, reload: reloadInstance } = useInstance(instanceId);

  // One-shot fetch the template list to resolve the spec.actions[] for this
  // instance. listTemplates is the panel-admin endpoint; for user-side rows
  // the same list is what the user-facing Instances page already pulls, so
  // the call cost is amortised — we have to issue it again here only because
  // the InstanceHome route is reached without the user having navigated past
  // the templates admin first.
  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((ts) => {
        if (cancelled) return;
        const tpl = ts.find((t) => t.id === templateId);
        if (!tpl) {
          setActions([]);
          setLoaded(true);
          return;
        }
        const spec = parseConfig(tpl.spec) || {};
        const raw = Array.isArray(spec.actions) ? (spec.actions as HomeTemplateAction[]) : [];
        // Filter to user-invokable actions only — actions with
        // user_invokable===false are reserved for automation jobs / boot hooks
        // and should not show as buttons on the home page.
        const visible = raw.filter((a) => a && typeof a.id === 'string' && a.id.trim() !== '' && a.user_invokable !== false);
        setActions(visible);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setActions([]);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [templateId]);

  // An in-flight install workflow (either install-completing or an earlier
  // action invocation) disables every button EXCEPT the one currently running.
  // That one morphs into a red "Stop" button: clicking it POSTs
  // /actions/{id}/stop, the panel cancels the edge workflow + runs the
  // action's optional stop_command inside the container. Other actions stay
  // disabled (the edge refuses a second install record on the same key while
  // one is running, so an invoke here would 409).
  const workflowInFlight = !!instance && instance.install_state === 'running';
  const runningActionId = workflowInFlight && instance.install_kind === 'action' ? instance.install_action_id : '';

  const onInvoke = useCallback(async (action: HomeTemplateAction) => {
    if (!action.id) return;
    setBusyId(action.id);
    setErr(null);
    try {
      await invokeInstanceAction(instanceId, action.id);
      // Reload the instance row so install_state/install_step reflect the
      // fresh workflow the panel just kicked off — the InstallBanner then
      // paints the action's progress.
      reloadInstance?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Extract the panel's error body so the operator sees the underlying
      // driver message verbatim instead of a context-less "Request failed
      // with status code 502". The panel uses http.Error (plain text) for
      // invoke failures — body looks like
      //   "edge rejected auto-start: <reason>"
      //   "edge rejected action invoke: <reason>"
      // — and JSON {error,message} for some other paths.
      if (axios.isAxiosError(e) && e.response) {
        const responseData = e.response.data;
        let errorMsg = msg;
        if (typeof responseData === 'string' && responseData) {
          if (responseData.startsWith('edge rejected action invoke: ')) {
            errorMsg = responseData.substring('edge rejected action invoke: '.length) || msg;
          } else if (responseData.startsWith('edge rejected auto-start: ')) {
            errorMsg = responseData.substring('edge rejected auto-start: '.length) || msg;
          } else {
            errorMsg = responseData || msg;
          }
        } else if (typeof responseData === 'object' && responseData !== null) {
          const data = responseData as { error?: string; message?: string };
          if (data.error || data.message) {
            errorMsg = (data.error || data.message) || msg;
          }
        }
        setErr(errorMsg);
        setBusyId(null);
        return;
      }
      setErr(msg);
    } finally {
      setBusyId(null);
    }
  }, [instanceId, reloadInstance]);

  const onStop = useCallback(async (action: HomeTemplateAction) => {
    if (!action.id) return;
    setStopId(action.id);
    setErr(null);
    try {
      await stopInstanceAction(instanceId, action.id);
      // Reload so install_action_id clears (the handler resets it
      // immediately; install_state flips once the sweep loop sees the
      // edge's cancelled→done/failed transition) and the button morphs
      // back to its invoke label.
      reloadInstance?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (axios.isAxiosError(e) && e.response) {
        const responseData = e.response.data;
        let errorMsg = msg;
        if (typeof responseData === 'string' && responseData) {
          // Handle plain text error responses from backend (e.g., "edge rejected action stop: [error]")
          if (responseData.startsWith('edge rejected action stop: ')) {
            errorMsg = responseData.substring('edge rejected action stop: '.length) || msg;
          } else {
            errorMsg = responseData || msg;
          }
        } else if (typeof responseData === 'object' && responseData !== null) {
          // Handle JSON error responses
          const data = responseData as { error?: string; message?: string };
          if (data.error || data.message) {
            errorMsg = (data.error || data.message) || msg;
          }
        }
        setErr(errorMsg);
        setStopId(null);
        return;
      }
      setErr(msg);
    } finally {
      setStopId(null);
    }
  }, [instanceId, reloadInstance]);

  if (!loaded || actions.length === 0) return null;

  return (
    <div className="glass-card rounded-xl animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Actions</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            One-click commands defined by this instance's template. They run inside the container; the panel auto-starts a stopped container if the action declares it. Click an action a second time while it's running to stop it.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const subtitles: string[] = [];
          if (a.auto_start_instance) subtitles.push('auto-start');
          if (a.auto_stop_on_exit) subtitles.push('stop on exit');
          if (a.restart_on_failure) subtitles.push('restart on crash');
          const subtitle = subtitles.join(' · ');
          const isBusy = busyId === a.id;
          const isThisRunning = workflowInFlight && runningActionId === a.id;
          const isStopping = stopId === a.id;
          // The currently-running action becomes a Stop button (clickable);
          // every other action stays disabled while any workflow is in flight.
          const disabled = workflowInFlight && !isThisRunning;
          const stopping = isThisRunning && isStopping;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => (isThisRunning ? onStop(a) : onInvoke(a))}
              disabled={disabled || isBusy || stopping}
              title={isThisRunning
                ? (a.stop_command
                    ? `Stop: runs "${a.stop_command}" inside the container (${a.stop_mode === 'same' ? 'same terminal → writes to process stdin' : 'different terminal → new exec'})`
                    : 'Stop the running action')
                : (a.description || subtitle || undefined)}
              className={[
                'group flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors min-w-[10rem]',
                isThisRunning
                  ? 'border-red-700/50 bg-red-900/30 text-red-100 hover:border-red-500/70 hover:bg-red-800/40'
                  : disabled
                    ? 'border-white/[0.05] bg-white/[0.02] text-gray-500 cursor-not-allowed'
                    : 'border-emerald-700/40 bg-emerald-900/20 text-emerald-100 hover:border-emerald-500/60 hover:bg-emerald-800/30',
              ].join(' ')}
            >
              <span className="text-sm font-medium leading-tight flex items-center gap-1.5">
                {/* Rotating cycle shown for the full lifetime of an in-flight
                    action: while the invoke POST is mid-round-trip (isBusy),
                    while it runs on the edge (isThisRunning), and while a stop
                    request is mid-flight (stopping). Before this change the
                    spinner only flashed during the invoke POST and the button
                    sat static for the (potentially minutes-long) edge run,
                    leaving the operator unsure the action was actually doing
                    anything. The cycle keeps spinning for the whole run. */}
                {(isBusy || isThisRunning || stopping) && (
                  <svg viewBox="0 0 24 24" className="animate-spin w-3.5 h-3.5 text-current opacity-90 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2 A10 10 0 0 1 22 12" />
                   </svg>
                )}
                {isThisRunning ? `Stop ${a.name || a.id}` : (a.name || a.id)}
              </span>
              {(isThisRunning
                ? <span className="text-[10px] uppercase tracking-wide text-red-300/90 group-hover:text-red-200">{stopping ? 'stopping…' : 'running — click to stop'}</span>
                : (subtitle && <span className="text-[10px] uppercase tracking-wide text-gray-400 group-hover:text-emerald-300/80">{subtitle}</span>)
              )}
            </button>
          );
        })}
      </div>
      {workflowInFlight && !runningActionId && (
        <p className="text-xs text-amber-300/80 mt-3">
          An install or action workflow is in progress — buttons disabled until it resolves.
        </p>
      )}
      {err && (
        <p className="text-xs text-red-300 mt-3 break-words">
          <span className="font-semibold">Action failed: </span>{err}
        </p>
      )}
    </div>
  );
};

export const InstanceHome: React.FC = () => {
  const { instance, loading, error, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  // Initialise true so the first paint (before the metrics effect has
  // fired setMetricsLoading(true)) already shows the home skeleton. With
  // the default `false` the page would paint once with "—" metric tiles
  // before the skeleton snapped in — a brief flicker on every fresh
  // /instances/:id navigation. The metrics effect flips this to false
  // once the first poll resolves (success or failure), at which point
  // the page falls through to a real render.
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!instanceId) return;
    let cancelled = false;
    setMetricsLoading(true);
    setMetricsError(null);
    getMetrics(instanceId)
      .then((data) => {
        if (cancelled) return;
        setMetrics(data);
        setMetricsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Surface the underlying driver/edge message verbatim instead of
        // the context-less axios wrapper ("Request failed with status
        // code 502"). The panel's metrics handler emits plain-text errors
        // (http.Error) for unreachable containers and JSON {error} on the
        // auth/permission paths, so handle both shapes — same extraction
        // pattern ActionsCard uses for action invoke/stop failures.
        if (axios.isAxiosError(err) && err.response) {
          const body = err.response.data;
          if (typeof body === 'string' && body.trim()) {
            setMetricsError(body.trim());
          } else if (body && typeof body === 'object') {
            const b = body as { error?: string; message?: string; detail?: string };
            setMetricsError(b.error || b.detail || b.message || err.message || 'Failed to fetch metrics');
          } else {
            setMetricsError(err.message || 'Failed to fetch metrics');
          }
        } else {
          setMetricsError(err instanceof Error ? err.message : String(err));
        }
        setMetricsLoading(false);
      });
    return () => { cancelled = true; };
  }, [instanceId]);

  if (loading || error || !instance) return <LoadingOrError loading={loading} error={error} kind="home" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="home" />;
  const t = templates.find((x) => x.id === instance.template_id);
  const spec = t ? parseConfig(t.spec) : null;
  // The Home page (`'.'` slug) is fixed — Home must always render for every
  // instance, even on legacy templates that have no `spec.pages` block at
  // all (the old `isPageAllowed('.', spec)` check used to short-circuit to a
  // "not part of this instance's template" card here, blanking the entire
  // home view). Only refuse to render if a template author has explicitly
  // *removed* Home (`enabled: false`) — in every other case the user gets
  // the Home tab whether or not the template bothers to list it.
  const homeEntry = Array.isArray(spec?.pages)
    ? spec!.pages.find((p: any) => p && p.slug === '.' && p.kind !== 'custom')
    : null;
  const homeDisabled = homeEntry && homeEntry.enabled === false;
  if (homeDisabled) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }
  // Show the home skeleton only while the very first metrics poll is in
  // flight AND we have neither a sample nor an error yet. Once the first
  // poll returns we ALWAYS render the page, degrading the CPU/Mem/Disk
  // tiles to '—' when metrics is null. Previously a single metrics 404/502
  // (e.g. from a stopped container whose edge inspect endpoint refuses)
  // hard-blanked the whole page — the operator lost status, identity,
  // lifecycle and template actions behind a context-less red banner.
  if (metricsLoading && !metrics && !metricsError) return <LoadingOrError loading={true} error="" kind="home" />;

  const cfg = extractConfig(parseConfig(instance.config));
   const sm = statusMeta(instance.status);
   const extId = cleanExternalId(instance.external_id);
   const isLive = instance.status === 'running';

   // Calculate resource usage from metrics. Each tile is 'number | null':
   // null means "no data" (an initial load or a failed poll) and renders
   // '—' in the stat strip below; a concrete 0 means "container isn't
   // running" (stopped/destroyed). Without this distinction a metrics
   // failure would render '0%' / '0 B' which is indistinguishable from a
   // genuinely-idle container and lies about the instance's state.
   const isStoppedOrDestroyed = instance.status === 'stopped' || instance.status === 'destroyed';
   const memUsed: number | null = isStoppedOrDestroyed ? 0 : (metrics?.mem_used ?? null);
   const memTotal: number | null = isStoppedOrDestroyed ? 0 : (metrics?.mem_total ?? null);
   const memUsagePercent: number | null =
     (memUsed != null && memTotal != null && memTotal > 0)
       ? Math.min(100, Math.round((memUsed / memTotal) * 100))
       : (isStoppedOrDestroyed ? 0 : null);
    
    const diskUsed: number | null = isStoppedOrDestroyed ? 0 : (metrics?.disk_used ?? null);
   // For disk total, use the configured disk limit from the instance config if available,
   // otherwise fall back to the host disk total from metrics (less meaningful but prevents NaN)
   let configuredDiskLimit = 0;
   try {
     const parsed = parseConfig(instance.config);
     const limits = parsed.limits || parsed.raw?.limits || {};
     const advanced = parsed.advanced || parsed.raw?.advanced || {};
      const pickLimit = (keys: string[]): number | null => {
        for (const k of keys) {
          const v = limits[k];
          if (v != null && v !== '') {
            const bytes = parseBytes(String(v));
            if (bytes !== null) return bytes;
          }
        }
        for (const k of keys) {
          const v = parsed[k];
          if (v != null && v !== '') {
            const bytes = parseBytes(String(v));
            if (bytes !== null) return bytes;
          }
        }
        for (const k of keys) {
          const v = advanced?.kvm?.[k];
          if (v != null && v !== '') {
            const bytes = parseBytes(String(v));
            if (bytes !== null) return bytes;
          }
        }
        for (const k of keys) {
          const v = advanced?.multipass?.[k];
          if (v != null && v !== '') {
            const bytes = parseBytes(String(v));
            if (bytes !== null) return bytes;
          }
        }
        for (const k of keys) {
          const v = advanced?.lxd?.[k];
          if (v != null && v !== '') {
            const bytes = parseBytes(String(v));
            if (bytes !== null) return bytes;
          }
        }
        return null;
      };
      const diskLimit = pickLimit(['disk', 'disk_size', 'disk-size', 'storage', 'disk_mb']);
      if (diskLimit !== null) {
        configuredDiskLimit = diskLimit;
      }
    } catch {
      // If parsing fails, fall back to metrics.disk_total
      configuredDiskLimit = 0;
    }
    const diskTotal: number | null = configuredDiskLimit > 0
      ? configuredDiskLimit
      : (isStoppedOrDestroyed ? 0 : (metrics?.disk_total ?? null));
    const diskUsagePercent: number | null =
      (diskUsed != null && diskTotal != null && diskTotal > 0)
        ? Math.min(100, Math.round((diskUsed / diskTotal) * 100))
        : (isStoppedOrDestroyed ? 0 : null);

    const cpuUsagePercent: number | null = isStoppedOrDestroyed ? 0 : (metrics?.cpu_pct ?? null);

  return (
    <div className="space-y-4">
      {/* Header card: kind icon, name, status chip, subtitle */}
      <div className="glass-card rounded-xl flex items-center gap-4 animate-fade-in">
        <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border ${kindBadgeClass(instance.kind)}`}>
          <KindIcon kind={instance.kind} className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-white truncate">{instance.name}</h2>
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border ${sm.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot} ${isLive ? 'animate-pulse' : ''}`} />
              {sm.label}
            </span>
            <span className={`inline-block text-xs px-2 py-0.5 rounded border ${kindBadgeClass(instance.kind)}`}>{instance.kind}</span>
          </div>
        </div>
        <div className="hidden md:block text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Instance</div>
          <div className="font-mono text-sm text-gray-200">#{instance.id}</div>
        </div>
      </div>

      {/* Metrics-unavailable banner — shown only when the inspect poll
          failed. The page still renders below (status/identity/lifecycle/
          actions); only the CPU/Mem/Disk tiles fall back to '—'. */}
      {metricsError && (
        <div className="glass-card rounded-xl border border-amber-700/40 flex items-start gap-2 text-xs text-amber-200 animate-fade-in">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-300 shrink-0 mt-0.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <div className="min-w-0">
            <span className="font-semibold">Metrics unavailable</span>
            <span className="text-amber-300/80 ml-1 break-words">{metricsError}</span>
            <div className="text-amber-300/60 mt-0.5">Resource tiles show no data; the rest of the page is unaffected.</div>
          </div>
        </div>
      )}

      {/* Stat tile strip (mirrors dashboard StatCards) */}
      <div className="ks-card-grid grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <HomeCard
          label="Status"
          value={<span className="capitalize">{sm.label}</span>}
          hint={isLive ? 'live & reachable' : 'not running'}
          accent={isLive ? 'text-emerald-300' : 'text-gray-300'}
          icon={
            <span className={`w-3 h-3 rounded-full ${sm.dot} ${isLive ? 'animate-pulse' : ''}`} />
          }
        />
        <HomeCard
          label="Kind"
          value={<span className="capitalize">{instance.kind}</span>}
          hint={cfg.image || 'no image'}
          accent="text-sky-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /> </svg>
          }
        />
        <HomeCard
          label="Node"
          value={<span className="truncate">{instance.node_name || `#${instance.node_id}`}</span>}
          hint="hosting edge"
          accent="text-emerald-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="3" width="20" height="6" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="17" x2="6.01" y2="17" /> </svg>
          }
        />
        <HomeCard
          label="Template"
          value={instance.template_name ? <span className="truncate">{instance.template_name}</span> : <span className="text-gray-500">deleted</span>}
          hint="deployed from"
          accent="text-violet-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /> </svg>
          }
        />
        <HomeCard
          label="Owner"
          value={instance.owner_name ? <span className="truncate">{instance.owner_name}</span> : (instance.owner_id ? <span className="font-mono">#{instance.owner_id}</span> : <span className="text-gray-500">unattributed</span>)}
          hint="allocated to"
          accent="text-amber-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 0 0 7.75" /> </svg>
          }
        />
        {/* Added resource usage cards. Each value/hint renders '—' when
            the metric is null (initial poll or a failed poll) so a
            transient metrics outage never lies about the instance's
            actual resource usage. */}
        <HomeCard
          label="CPU"
          value={<span className="font-mono">{cpuUsagePercent != null ? `${cpuUsagePercent}%` : '—'}</span>}
          hint={cpuUsagePercent != null ? 'usage / total' : 'unavailable'}
          accent="text-sky-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /> </svg>
          }
        />
        <HomeCard
          label="Memory"
          value={<span className="font-mono">{memUsed != null ? formatBytes(memUsed) : '—'}</span>}
          hint={memUsed != null && memTotal != null ? `${formatBytes(memUsed)} / ${formatBytes(memTotal)}${memUsagePercent != null ? ` (${memUsagePercent}%)` : ''}` : 'unavailable'}
          accent="text-emerald-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="8" width="20" height="9" rx="1.5" /><path d="M6 8v3M10 8v3M14 8v3M18 8v3" /><path d="M4 17v3M8 17v3M12 17v3M16 17v3M20 17v3" /> </svg>
          }
        />
        <HomeCard
          label="Disk"
          value={<span className="font-mono">{diskUsed != null ? formatBytes(diskUsed) : '—'}</span>}
          hint={diskUsed != null && diskTotal != null ? `${formatBytes(diskUsed)} / ${formatBytes(diskTotal)}${diskUsagePercent != null ? ` (${diskUsagePercent}%)` : ''}` : 'unavailable'}
          accent="text-amber-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /><path d="M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /> </svg>
          }
        />
      </div>

      {/* Install-workflow banner (Flow 2). Same state the InstanceCard
          surfaces, but spelled out: per-step transcript pulled from the
          install_steps_json column installSweepLoop keeps up to date. The
          banner renders only for the TEMPLATE install workflow
          (install_kind !== 'action'); a template-defined action invoked
          from the Actions card (e.g. "Start Java") reuses the install
          workflow engine under the hood but is NOT an install — surfacing the
          "Installing…" banner for it was misleading (the container was already
          up; the operator kicked a one-off command, not a post-create
          install). The ActionsCard already morphs the running action's button
          into a Stop button + spinner, which is the correct in-flight UI for
          an action, so we suppress the install banner entirely while an
          action is running. */}
      {(instance.install_state === 'running' || instance.install_state === 'failed') && instance.install_kind !== 'action' && (
        <InstallBanner
          state={instance.install_state || ''}
          step={instance.install_step ?? -1}
          error={instance.install_error || ''}
          stepsJSON={instance.install_steps_json || ''}
        />
      )}

      {/* Template-defined actions card. Renders every spec.actions[] entry
          from the template that produced this instance as a labelled button;
          clicking it POSTs /api/instances/{id}/actions/{actionId}/invoke,
          which the panel routes through the edge install-workflow engine
          (re-keyed as an action — installSweepLoop reads install_kind='action'
          + install_auto_stop on completion and decides whether to stop the
          container based on the action's auto_stop_on_exit flag). The card
          only renders for templates whose spec carries an actions[] array;
          templates without actions are skipped (null render). */}
      <ActionsCard instanceId={instance.id} templateId={instance.template_id} />

      {/* Identity dl + endpoints */}
      <div className="ks-card-grid grid grid-cols-1 lg:grid-cols-2">
        <Section title="Identity" description="What this instance is and how the panel references it.">
          <dl className="divide-y divide-white/[0.06] -my-1">
            <InfoRow
              label="External ID"
              value={
                extId ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="font-mono text-gray-300 text-xs truncate max-w-[14ch]"
                      title={extId}
                    >
                      {extId}
                    </span>
                    <button
                      type="button"
                      onClick={() => { try { navigator.clipboard.writeText(extId); } catch {} }}
                      title="Copy external ID"
                      className="inline-flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1" /> </svg>
                    </button>
                  </span>
                ) : (
                  <span className="font-mono text-gray-300 text-xs">—</span>
                )
              }
            />
          </dl>
        </Section>

        <Section title="Lifecycle" description="Provenance and timing for this deployment.">
          <dl className="divide-y divide-white/[0.06] -my-1">
            <InfoRow label="Created" value={<span className="text-gray-300">{instance.created_at ? new Date(instance.created_at).toLocaleString() : '—'}</span>} />
            <InfoRow label="Updated" value={<span className="text-gray-300">{instance.updated_at ? new Date(instance.updated_at).toLocaleString() : '—'}</span>} />
          </dl>
        </Section>
      </div>
    </div>
  );
};

const Home: BuiltinPageManifestEntry = {
  slug: '.',
  name: 'Home',
  fixed: true,
  iconName: 'Home',
  iconSvg: '<path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />',
  component: InstanceHome,
};

export default Home;
