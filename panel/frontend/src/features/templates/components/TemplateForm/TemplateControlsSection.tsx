import React, { useState } from 'react';
import type { InstanceControls, OverviewDefaultTab } from '@/features/instances/utils/instanceControls';
import { DEFAULT_INSTANCE_CONTROLS } from '@/features/instances/utils/instanceControls';
import { BUILTIN_PAGE_SLUGS, normalizePageSlug } from '@/shared/utils/instancePages';

export interface ControlsSectionProps {
  controls: InstanceControls;
  onUpdate: (patch: Partial<InstanceControls>) => void;
  onReset?: () => void;
  sectionCls: string;
  labelCls: string;
  /** Enabled page paths of the form being edited (template or instance).
   *  When provided, the More-link field warns if the entered slug matches
   *  neither a built-in nor one of these paths — such a value silently
   *  falls back to Overview at runtime. */
  pageSlugs?: string[];
}

const MiniToggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({
  checked,
  onChange,
  label,
  hint,
}) => (
  <label className="flex items-start justify-between gap-3 py-1.5 cursor-pointer" title={hint}>
    <span className="min-w-0">
      <span className="block text-sm text-gray-200">{label}</span>
      {hint && <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>}
    </span>
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className={`relative w-9 h-5 rounded-full transition shrink-0 mt-0.5 ${checked ? 'bg-green-600' : 'bg-neutral-700'}`}
      aria-pressed={checked}
      aria-label={label}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${checked ? 'translate-x-4' : ''}`} />
    </button>
  </label>
);

const CheckRow: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  hint,
  disabled,
}) => (
  <label
    className={`flex items-start gap-2.5 py-1.5 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    title={hint}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
    />
    <span className="min-w-0">
      <span className="block text-sm text-gray-200">{label}</span>
      {hint && <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>}
    </span>
  </label>
);

const ConfigGearButton: React.FC<{ open: boolean; onToggle: () => void; label: string }> = ({
  open,
  onToggle,
  label,
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    aria-label={label}
    title={label}
    className={`shrink-0 mt-1 p-1.5 rounded-md border transition ${
      open
        ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
        : 'border-white/10 bg-white/[0.03] text-gray-400 hover:text-gray-200 hover:border-white/25'
    }`}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  </button>
);

const TabRow: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  hasConfig?: boolean;
  configOpen?: boolean;
  onToggleConfig?: () => void;
  configLabel?: string;
  children?: React.ReactNode;
}> = ({
  checked,
  onChange,
  label,
  hint,
  hasConfig,
  configOpen,
  onToggleConfig,
  configLabel,
  children,
}) => (
  <div className="py-1 border-b border-white/5 last:border-0">
    <div className="flex items-start gap-2">
      <label className="flex items-start gap-2.5 py-1.5 cursor-pointer flex-1 min-w-0" title={hint}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
        />
        <span className="min-w-0">
          <span className="block text-sm text-gray-200">{label}</span>
          {hint && <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>}
        </span>
      </label>
      {checked && hasConfig && onToggleConfig && (
        <ConfigGearButton
          open={!!configOpen}
          onToggle={onToggleConfig}
          label={configLabel || `Configure ${label}`}
        />
      )}
    </div>
    {checked && hasConfig && configOpen && (
      <div className="ml-6 mt-1 mb-1.5 rounded-md border border-white/10 bg-black/30 px-3 py-1 divide-y divide-white/5">
        {children}
      </div>
    )}
  </div>
);

export const TemplateControlsSection: React.FC<ControlsSectionProps> = ({
  controls,
  onUpdate,
  onReset,
  sectionCls,
  labelCls,
  pageSlugs,
}) => {
  const c = controls;
  const powerCount = [c.allow_start, c.allow_stop, c.allow_restart, c.allow_kill].filter(Boolean).length;
  const tabCount = [c.show_details_tab, c.show_monitoring_tab, c.show_manage_tab, c.show_activity_tab].filter(Boolean).length;
  const [openTabConfig, setOpenTabConfig] = useState<'details' | 'manage' | null>(null);
  const toggleTabConfig = (tab: 'details' | 'manage') =>
    setOpenTabConfig((prev) => (prev === tab ? null : tab));
  // More-link validation: normalized slug resolves at runtime only when it
  // is a built-in or an enabled page path — anything else falls back to
  // Overview, which is exactly the "I typed ks but still get overview"
  // trap. Surface it here instead of failing silently.
  const moreSlug = normalizePageSlug(c.more_page);
  const moreKnown =
    moreSlug === '' ||
    moreSlug === '.' ||
    (BUILTIN_PAGE_SLUGS as string[]).includes(moreSlug) ||
    (pageSlugs ?? []).some((s) => normalizePageSlug(s) === moreSlug);

  return (
    <div className="space-y-4">
      <div className={sectionCls}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Instance Controls · Floating menu</h4>
            <p className="text-xs text-gray-500">What the draggable Instance controls menu may show for instances of this template.</p>
          </div>
          {onReset && (
            <button type="button" onClick={onReset} className="text-xs text-sky-300 hover:text-sky-200 underline" title="Reset all controls to allow-all">
              Reset to allow all
            </button>
          )}
        </div>

        <MiniToggle
          checked={c.show_info_row}
          onChange={(v) => onUpdate({ show_info_row: v })}
          label="Show status info row"
          hint="Uptime / status + type badge + live stats box at the top of the menu"
        />

        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-1 mt-1">
          <p className={labelCls}>Live stats (checkboxes)</p>
          <CheckRow checked={c.show_cpu} disabled={!c.show_info_row} onChange={(v) => onUpdate({ show_cpu: v })} label="CPU" hint="Live CPU % in the info row" />
          <CheckRow checked={c.show_ram} disabled={!c.show_info_row} onChange={(v) => onUpdate({ show_ram: v })} label="RAM" hint="Live memory usage in the info row" />
          <CheckRow checked={c.show_disk} disabled={!c.show_info_row} onChange={(v) => onUpdate({ show_disk: v })} label="Disk" hint="Live disk usage in the info row" />
        </div>

        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-1">
          <p className={labelCls}>Power buttons (checkboxes · {powerCount} of 4 allowed)</p>
          <CheckRow checked={c.allow_start} onChange={(v) => onUpdate({ allow_start: v })} label="Start" hint="Show Start when stopped / errored" />
          <CheckRow checked={c.allow_stop} onChange={(v) => onUpdate({ allow_stop: v })} label="Stop" hint="Graceful stop while running" />
          <CheckRow checked={c.allow_restart} onChange={(v) => onUpdate({ allow_restart: v })} label="Restart" hint="Restart while running" />
          <CheckRow checked={c.allow_kill} onChange={(v) => onUpdate({ allow_kill: v })} label="Kill" hint="Force-stop (confirm dialog) while running" />
        </div>

        <MiniToggle
          checked={c.allow_template_actions}
          onChange={(v) => onUpdate({ allow_template_actions: v })}
          label="Template actions"
          hint="Run/Stop selector for template-defined actions at the bottom of the menu"
        />
      </div>

      <div className={sectionCls}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">More page · Overview tabs</h4>
        <p className="text-xs text-gray-500">Which tabs the More → Overview page offers. At least one tab must stay on — the page falls back to the first allowed tab.</p>
        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-1 mt-2">
          <p className={labelCls}>Visible tabs (checkboxes · {tabCount} of 4 on)</p>
          <TabRow
            checked={c.show_details_tab}
            onChange={(v) => {
              onUpdate({ show_details_tab: v });
              if (!v && openTabConfig === 'details') setOpenTabConfig(null);
            }}
            label="Details"
            hint="Tiles: container, node, template, external ID, lifecycle"
            hasConfig
            configOpen={openTabConfig === 'details'}
            onToggleConfig={() => toggleTabConfig('details')}
            configLabel="Configure Details tab — tile shortcuts allowed or not"
          >
            <MiniToggle checked={c.allow_external_id_copy} onChange={(v) => onUpdate({ allow_external_id_copy: v })} label="External ID copy" hint="Click the External ID tile to copy the driver-side ID" />
            <MiniToggle checked={c.allow_node_link} onChange={(v) => onUpdate({ allow_node_link: v })} label="Node link" hint="Click the Node tile to open its node" />
            <MiniToggle checked={c.allow_template_link} onChange={(v) => onUpdate({ allow_template_link: v })} label="Template link" hint="Click the Template tile to open its template" />
          </TabRow>
          <TabRow
            checked={c.show_monitoring_tab}
            onChange={(v) => onUpdate({ show_monitoring_tab: v })}
            label="Monitoring"
            hint="Live CPU / RAM / disk tiles + graphs"
          />
          <TabRow
            checked={c.show_manage_tab}
            onChange={(v) => {
              onUpdate({ show_manage_tab: v });
              if (!v && openTabConfig === 'manage') setOpenTabConfig(null);
            }}
            label="Manage"
            hint="Rename + advanced config + danger zone"
            hasConfig
            configOpen={openTabConfig === 'manage'}
            onToggleConfig={() => toggleTabConfig('manage')}
            configLabel="Configure Manage tab — actions allowed or not"
          >
            <MiniToggle checked={c.allow_rename} onChange={(v) => onUpdate({ allow_rename: v })} label="Rename" hint="Display-name editor" />
            <MiniToggle checked={c.allow_edit_advanced} onChange={(v) => onUpdate({ allow_edit_advanced: v })} label="Edit advanced config" hint="Ports / env / volumes editor entry" />
            <MiniToggle checked={c.allow_reinstall} onChange={(v) => onUpdate({ allow_reinstall: v })} label="Reinstall" hint="Wipe + redeploy from stored spec (confirm dialog)" />
            <MiniToggle checked={c.allow_destroy} onChange={(v) => onUpdate({ allow_destroy: v })} label="Destroy" hint="Driver destroy + remove row (confirm dialog)" />
          </TabRow>
          <TabRow
            checked={c.show_activity_tab}
            onChange={(v) => onUpdate({ show_activity_tab: v })}
            label="Activity"
            hint="Per-instance audit trail"
          />
        </div>
        <div className="mt-2">
          <label className={labelCls}>Default tab (dropdown)</label>
          <select
            value={c.default_tab}
            onChange={(e) => onUpdate({ default_tab: e.target.value as OverviewDefaultTab })}
            className="glass-field w-full sm:max-w-xs"
            aria-label="Default overview tab"
          >
            <option value="details">Details</option>
            <option value="monitoring">Monitoring</option>
            <option value="manage">Manage</option>
            <option value="activity">Activity</option>
          </select>
          <p className="text-[11px] text-gray-500 mt-1">If the default tab is hidden, the page opens the first visible tab instead.</p>
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">More page · More link</h4>
        <p className="text-xs text-gray-500">Which page the floating menu's More button opens. Enter its slug — the URL it is accessible at.</p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-gray-500 text-sm font-mono">/</span>
          <input
            value={c.more_page}
            onChange={(e) => onUpdate({ more_page: e.target.value })}
            placeholder="overview"
            aria-label="More link target slug"
            title="Slug of the page the More button opens, e.g. overview or files"
            className="glass-field font-mono flex-1"
          />
          {c.more_page !== DEFAULT_INSTANCE_CONTROLS.more_page && (
            <button
              type="button"
              onClick={() => onUpdate({ more_page: DEFAULT_INSTANCE_CONTROLS.more_page })}
              className="text-xs text-gray-400 hover:text-white underline shrink-0"
              title="Reset to overview"
            >
              Reset
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          More opens <code className="font-mono text-sky-300">/{(c.more_page.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_INSTANCE_CONTROLS.more_page)}</code>. Use a page Path or a built-in (overview, ports, sftp, snapshots). Unknown slugs fall back to Overview.
        </p>
        {!moreKnown && (
          <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-700/30 rounded-md px-2.5 py-1.5 mt-1.5">
            No enabled page with path <code className="font-mono">/{moreSlug}</code> here{pageSlugs ? '' : ' (page list unavailable)'} — More will fall back to Overview. Import it under Pages or use a built-in slug.
          </p>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        Empty / old templates allow everything. Saved per template and snapshotted into each new instance on deploy — existing instances keep their own copy.
        Current: {isCustomNote(c)}
      </p>
    </div>
  );
};

function isCustomNote(c: InstanceControls): string {
  const d = DEFAULT_INSTANCE_CONTROLS;
  const off = (Object.keys(d) as (keyof InstanceControls)[]).filter((k) => c[k] !== d[k]);
  if (off.length === 0) return 'allow-all (nothing restricted)';
  return `${off.length} restriction${off.length === 1 ? '' : 's'}: ${off.join(', ')}`;
}
