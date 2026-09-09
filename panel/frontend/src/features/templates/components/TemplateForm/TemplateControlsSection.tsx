import React, { useState } from 'react';
import type { InstanceControls, InstanceShortcutConfig, OverviewDefaultTab, ShortcutKey, TerminalDefaultDef, TerminalShortcutDef } from '@/features/instances/utils/instanceControls';
import { DEFAULT_INSTANCE_CONTROLS, DEFAULT_SHORTCUTS, SHORTCUT_KEYS, isShortcutCustom, MAX_DEFAULT_TERMINALS, SUGGESTED_DEFAULT_TERMINAL, MAX_TERMINAL_SHORTCUTS } from '@/features/instances/utils/instanceControls';
import { BUILTIN_PAGE_SLUGS, normalizePageSlug } from '@/shared/utils/instancePages';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { COLOR_SWATCHES, ICON_PRESETS } from '@/features/instances/types/instanceForm';

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

const TabRow: React.FC<{  checked: boolean;
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
  <div className="py-1 border-b border-white/5 last:border-0 min-w-0">
    <div className="flex items-start gap-2 min-w-0">
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
      <div className="ml-6 mt-1 mb-1.5 rounded-md border border-white/10 bg-black/30 px-3 py-1 divide-y divide-white/5 min-w-0 max-w-full overflow-x-clip">
        {children}
      </div>
    )}
  </div>
);

// ShortcutDefaultGlyph — fallback glyph per shortcut for the config preview
// (mirrors the floating menu's default icons when no custom SVG is set).
const ShortcutDefaultGlyph: React.FC<{ shortcutKey: ShortcutKey }> = ({ shortcutKey }) => {
  if (shortcutKey === 'files') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
    );
  }
  if (shortcutKey === 'terminal') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true"><rect x="2" y="7" width="20" height="8" rx="2" /><path d="M6 7v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /><path d="M6 15v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" /></svg>
  );
};

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
  // Shortcut editor: which of Files / Terminal / Ports shows its slug +
  // name + SVG + page-option config panel.
  const [openShortcut, setOpenShortcut] = useState<ShortcutKey | null>(null);
  const toggleShortcut = (key: ShortcutKey) =>
    setOpenShortcut((prev) => (prev === key ? null : key));
  // Dismissal of the suggested Main/main default-terminal row (shown while
  // nothing is configured). Dismissing writes nothing — empty stays empty
  // (legacy blank shell); any edit/add persists the rows for real.
  const [seedDismissed, setSeedDismissed] = useState(false);
  const updateShortcut = (key: ShortcutKey, patch: Partial<InstanceShortcutConfig>) =>
    onUpdate({ shortcuts: { ...c.shortcuts, [key]: { ...c.shortcuts[key], ...patch } } });
  const resetShortcut = (key: ShortcutKey) =>
    onUpdate({ shortcuts: { ...c.shortcuts, [key]: { ...DEFAULT_SHORTCUTS[key] } } });
  const shortcutCount = SHORTCUT_KEYS.filter((k) => c.shortcuts[k]?.show).length;
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Menu shortcuts · Files / Terminal / Ports</h4>
            <p className="text-xs text-gray-500">Quick buttons above Actions in the floating menu. Per shortcut: visibility, URL slug, name, SVG icon + colour, and one page option.</p>
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-1 mt-2">
          <p className={labelCls}>Shortcuts (checkboxes · {shortcutCount} of 3 shown)</p>
          {SHORTCUT_KEYS.map((key) => {
            const s = c.shortcuts[key];
            const d = DEFAULT_SHORTCUTS[key];
            const slug = normalizePageSlug(s.slug) || d.slug;
            const label = s.label.trim() || d.label;
            const custom = isShortcutCustom(s, d);
            return (
              <TabRow
                key={key}
                checked={s.show}
                onChange={(v) => updateShortcut(key, { show: v })}
                label={`${label}${custom ? ' · customized' : ''}`}
                hint={`Opens /${slug} — gear opens slug, name, SVG + page options`}
                hasConfig
                configOpen={openShortcut === key}
                onToggleConfig={() => toggleShortcut(key)}
                configLabel={`Configure ${d.label} shortcut — slug, name, SVG icon and page options`}
              >
                <div className="py-1 space-y-2 min-w-0 max-w-full">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">URL slug</label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-sm font-mono">/</span>
                        <input
                          value={s.slug}
                          onChange={(e) => updateShortcut(key, { slug: e.target.value })}
                          placeholder={d.slug}
                          aria-label={`${d.label} shortcut URL slug`}
                          title="URL slug the shortcut navigates to"
                          className="glass-field font-mono flex-1 min-w-0"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Name</label>
                      <input
                        value={s.label}
                        onChange={(e) => updateShortcut(key, { label: e.target.value })}
                        placeholder={d.label}
                        aria-label={`${d.label} shortcut display name`}
                        title="Display name on the menu button"
                        className="glass-field w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">SVG icon + colour</label>
                    <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
                      <span
                        className="w-9 h-9 shrink-0 rounded-md flex items-center justify-center border bg-white/[0.05] border-white/10 [&>svg]:w-5 [&>svg]:h-5 [&>svg]:block"
                        style={s.icon_color ? { color: s.icon_color } : { color: d.icon_color }}
                        aria-hidden="true"
                        dangerouslySetInnerHTML={s.icon_svg.trim() !== '' ? { __html: sanitizeSvgIcon(s.icon_svg) } : undefined}
                      >
                        {s.icon_svg.trim() === '' && <ShortcutDefaultGlyph shortcutKey={key} />}
                      </span>
                      <div className="flex gap-1.5 overflow-x-auto ks-hscroll pb-1 flex-1 min-w-0">
                        {ICON_PRESETS.map((p) => (
                          <button
                            key={p.value || 'none'}
                            type="button"
                            onClick={() => updateShortcut(key, { icon_svg: p.svg })}
                            className={`shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-colors ${s.icon_svg === p.svg ? 'border-sky-400/60 bg-sky-500/15' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                            title={p.label || 'Default icon'}
                          >
                            {p.svg ? (
                              <span className="[&>svg]:w-4 [&>svg]:h-4 [&>svg]:block" dangerouslySetInnerHTML={{ __html: p.svg }} />
                            ) : (
                              <span className="text-[11px] text-gray-400 px-0.5">∅</span>
                            )}
                            <span className="text-[11px] text-gray-300">{p.label || 'Default'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <input
                        value={s.icon_svg}
                        onChange={(e) => updateShortcut(key, { icon_svg: e.target.value })}
                        placeholder="…or paste custom SVG markup"
                        aria-label={`${d.label} shortcut custom SVG`}
                        className="glass-field font-mono w-full min-w-0"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {COLOR_SWATCHES.map((sw) => (
                          <button
                            key={sw.value || 'none'}
                            type="button"
                            onClick={() => updateShortcut(key, { icon_color: sw.value })}
                            className={`shrink-0 w-6 h-6 rounded-md border transition-transform ${(s.icon_color || '') === sw.value ? 'border-white scale-105' : 'border-white/10 hover:border-white/30'}`}
                            style={{ backgroundColor: sw.value || 'transparent' }}
                            title={sw.label || 'Default colour'}
                          />
                        ))}
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(s.icon_color || '') ? (s.icon_color as string) : d.icon_color}
                          onChange={(e) => updateShortcut(key, { icon_color: e.target.value })}
                          className="w-6 h-6 rounded-md border border-white/10 cursor-pointer bg-transparent p-0"
                          title="Custom colour"
                        />
                      </div>
                    </div>
                  </div>
                  {key === 'files' && (
                    <>
                      <MiniToggle
                        checked={s.show_sftp}
                        onChange={(v) => updateShortcut(key, { show_sftp: v })}
                        label="Show SFTP card"
                        hint="SFTP connection card above the file manager on the Files page"
                      />
                      <div className="pt-1">
                        <label className="block text-[11px] text-gray-500 mb-0.5" htmlFor={`shortcut-${key}-home`}>
                          Home path (default folder)
                        </label>
                        <input
                          id={`shortcut-${key}-home`}
                          value={s.files_home}
                          onChange={(e) => updateShortcut(key, { files_home: e.target.value })}
                          placeholder="/mc"
                          aria-label="Files home path"
                          title="Folder the Files page opens by default, e.g. /mc. Empty = volume mount root."
                          className="glass-field font-mono w-full"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                          Files opens here by default. Empty = volume mount root (current behaviour).
                        </p>
                      </div>
                      <MiniToggle
                        checked={s.files_jail}
                        onChange={(v) => updateShortcut(key, { files_jail: v })}
                        label="Lock to home folder"
                        hint="Operators can't navigate above the home path, but see everything inside it"
                      />
                    </>
                  )}
                  {key === 'terminal' && (
                    <>
                    <MiniToggle
                      checked={s.terminal_allow_multi}
                      onChange={(v) => updateShortcut(key, { terminal_allow_multi: v })}
                      label="Allow multiple terminals"
                      hint="Operators may add more terminal panes together on the Terminal page"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Max terminals (empty = unlimited)</label>
                        <input
                          type="number"
                          min="0"
                          value={s.terminal_max}
                          onChange={(e) => updateShortcut(key, { terminal_max: e.target.value.replace(/[^0-9]/g, '') })}
                          placeholder="4"
                          aria-label="Maximum terminal panes"
                          className="glass-field font-mono w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">New-pane input default</label>
                        <select
                          value={s.terminal_default_allow_input}
                          onChange={(e) => updateShortcut(key, { terminal_default_allow_input: e.target.value as typeof s.terminal_default_allow_input })}
                          aria-label="Default terminal input mode"
                          className="glass-field w-full"
                        >
                          <option value="all">Allow all input</option>
                          <option value="allowlist">Selected commands only</option>
                          <option value="disabled">Read-only</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <MiniToggle
                        checked={s.terminal_default_stop_on_exit}
                        onChange={(v) => updateShortcut(key, { terminal_default_stop_on_exit: v })}
                        label="Stop pane when action ends"
                        hint="New panes lock input once the bound action's process exits"
                      />
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">New-pane timeout (s, optional)</label>
                        <input
                          type="number"
                          min="0"
                          value={s.terminal_default_timeout_s}
                          onChange={(e) => updateShortcut(key, { terminal_default_timeout_s: e.target.value.replace(/[^0-9]/g, '') })}
                          placeholder="no limit"
                          aria-label="Default terminal timeout seconds"
                          className="glass-field font-mono w-full"
                        />
                      </div>
                    </div>
                    <div className="pt-1 min-w-0 max-w-full">
                      <label className="block text-[11px] text-gray-500 mb-0.5">Input method</label>
                      <select
                        value={s.terminal_input_mode || 'direct'}
                        onChange={(e) => updateShortcut(key, { terminal_input_mode: e.target.value as typeof s.terminal_input_mode })}
                        aria-label="Terminal input method"
                        className="glass-field w-full"
                      >
                        <option value="direct">Direct — type straight into the terminal (linux-like)</option>
                        <option value="box">Input box — output-only terminal with an input + Send row below</option>
                      </select>
                    </div>
                    {(s.terminal_input_mode || 'direct') === 'direct' && (
                      <div className="pt-1 min-w-0 max-w-full">
                        <label className="block text-[11px] text-gray-500 mb-0.5">Prompt line (direct mode)</label>
                        <select
                          value={s.terminal_prompt || 'none'}
                          onChange={(e) => updateShortcut(key, { terminal_prompt: e.target.value as typeof s.terminal_prompt })}
                          aria-label="Terminal prompt line style"
                          className="glass-field w-full"
                        >
                          <option value="none">None — no prompt line</option>
                          <option value="host_path">Host + path — instance@node:~$</option>
                          <option value="host">Host only — instance@node$</option>
                          <option value="path">Path only — ~$</option>
                        </select>
                      </div>
                    )}
                    <MiniToggle
                      checked={!!s.terminal_shortcuts_enabled}
                      onChange={(v) => updateShortcut(key, { terminal_shortcuts_enabled: v })}
                      label="Shortcuts"
                      hint="Pre-made command buttons on the Terminal page (tps, apt install …, op ${username_mc} with ask-fields)"
                    />
                    {s.terminal_shortcuts_enabled && (
                      <div className="pt-1 min-w-0 max-w-full">
                        <label className="block text-[11px] text-gray-500 mb-0.5">Shortcuts (label + command — {'{{VAR}}'} / {'${VAR}'} / {'$(VAR)'} asks the operator)</label>
                        <div className="space-y-1.5">
                          {(s.terminal_shortcuts || []).map((sc, si) => (
                            <div key={si} className="flex items-center gap-2 min-w-0">
                              <input
                                value={sc.label}
                                onChange={(e) => updateShortcut(key, { terminal_shortcuts: (s.terminal_shortcuts || []).map((x, j) => (j === si ? { ...x, label: e.target.value.slice(0, 64) } : x)) })}
                                placeholder="TPS"
                                aria-label={`Shortcut ${si + 1} label`}
                                title="Button text on the Terminal page"
                                className="glass-field w-full min-w-0 flex-1"
                              />
                              <input
                                value={sc.command}
                                onChange={(e) => updateShortcut(key, { terminal_shortcuts: (s.terminal_shortcuts || []).map((x, j) => (j === si ? { ...x, command: e.target.value.slice(0, 500) } : x)) })}
                                placeholder="tps"
                                aria-label={`Shortcut ${si + 1} command`}
                                title="Command sent on run — {{VAR}} / ${VAR} / $(VAR) asks the operator for a value"
                                className="glass-field font-mono w-full min-w-0 flex-[2]"
                              />
                              <button
                                type="button"
                                onClick={() => updateShortcut(key, { terminal_shortcuts: (s.terminal_shortcuts || []).filter((_, j) => j !== si) })}
                                className="shrink-0 p-1.5 rounded-md text-gray-500 hover:text-red-300 hover:bg-white/5"
                                title="Remove shortcut"
                                aria-label={`Remove shortcut ${si + 1}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                              </button>
                            </div>
                          ))}
                          {(s.terminal_shortcuts || []).length === 0 && (
                            <p className="text-[11px] text-gray-500">No shortcuts yet — add one below (e.g. TPS / tps, or Give OP / {'op ${username_mc}'}).</p>
                          )}
                          {(s.terminal_shortcuts || []).length < MAX_TERMINAL_SHORTCUTS ? (
                            <button
                              type="button"
                              onClick={() => updateShortcut(key, { terminal_shortcuts: [...(s.terminal_shortcuts || []), { label: '', command: '' }] })}
                              className="text-xs text-sky-300 hover:text-sky-200 underline"
                              title="Add another shortcut"
                            >
                              + Add shortcut
                            </button>
                          ) : (
                            <p className="text-[11px] text-gray-500">Max {MAX_TERMINAL_SHORTCUTS} shortcuts.</p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="pt-1 min-w-0 max-w-full">
                      <label className="block text-[11px] text-gray-500 mb-0.5">Default terminals (open automatically on the Terminal page)</label>                      {(() => {
                        const configured = s.default_terminals.length > 0;
                        const rows: TerminalDefaultDef[] = configured
                          ? s.default_terminals
                          : (seedDismissed ? [] : [{ ...SUGGESTED_DEFAULT_TERMINAL }]);
                        const commit = (next: TerminalDefaultDef[]) => updateShortcut(key, { default_terminals: next });
                        return (
                          <div className="space-y-1.5">
                            {rows.map((t, ti) => (
                              <div key={ti} className="flex items-center gap-2 min-w-0">
                                <input
                                  value={t.name}
                                  onChange={(e) => commit(rows.map((x, j) => (j === ti ? { ...x, name: e.target.value.slice(0, 64) } : x)))}
                                  placeholder="Main"
                                  aria-label={`Default terminal ${ti + 1} name`}
                                  title="Tab label on the Terminal page"
                                  className="glass-field w-full min-w-0 flex-1"
                                />
                                <input
                                  value={t.id}
                                  onChange={(e) => commit(rows.map((x, j) => (j === ti ? { ...x, id: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '') } : x)))}
                                  placeholder="main"
                                  aria-label={`Default terminal ${ti + 1} ID`}
                                  title="Terminal ID — empty = plain shell, otherwise must match an action/install/startup terminal ID for its live console"
                                  className="glass-field font-mono w-full min-w-0 flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => { if (configured) commit(rows.filter((_, j) => j !== ti)); else setSeedDismissed(true); }}
                                  className="shrink-0 p-1.5 rounded-md text-gray-500 hover:text-red-300 hover:bg-white/5"
                                  title="Remove default terminal"
                                  aria-label={`Remove default terminal ${ti + 1}`}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                </button>
                              </div>
                            ))}
                            {rows.length === 0 && (
                              <p className="text-[11px] text-gray-500">No default terminals — the Terminal page opens a single blank shell. Add one below (e.g. Main / main).</p>
                            )}
                            {rows.length < MAX_DEFAULT_TERMINALS ? (
                              <button
                                type="button"
                                onClick={() => commit([...rows, { name: '', id: '' }])}
                                className="text-xs text-sky-300 hover:text-sky-200 underline"
                                title="Add another default terminal"
                              >
                                + Add terminal
                              </button>
                            ) : (
                              <p className="text-[11px] text-gray-500">Max {MAX_DEFAULT_TERMINALS} default terminals.</p>
                            )}
                            {!configured && rows.length > 0 && (
                              <p className="text-[11px] text-gray-500">Suggestion — edit or add to keep it (saved with the template), or remove it to stay with a blank shell.</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <p className="text-[11px] text-gray-500">Each pane stays fully customizable (ID, input mode, timeout, stop-on-exit) without editing the template. Enter an action's Terminal ID to stream its full log + gated input.</p>
                    </>
                  )}
                  {key === 'ports' && (
                    <MiniToggle
                      checked={s.allow_edit}
                      onChange={(v) => updateShortcut(key, { allow_edit: v })}
                      label="Allow Add / Remove"
                      hint="Off = read-only port table on the Ports page"
                    />
                  )}
                  {custom && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => resetShortcut(key)}
                        className="text-xs text-gray-400 hover:text-white underline"
                        title={`Reset ${d.label} shortcut to defaults`}
                      >
                        Reset {d.label} to defaults
                      </button>
                    </div>
                  )}
                </div>
              </TabRow>
            );
          })}
        </div>
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
        <p className="text-xs text-gray-500">Which page the floating menu's More button opens. Enter its slug — the URL it is accessible at. Env variables work here too (<code className="font-mono text-gray-400">{'{{HOME_PAGE}}'}</code> / <code className="font-mono text-gray-400">{'${HOME_PAGE}'}</code>).</p>
        <div className="flex items-center gap-1.5 mt-2 min-w-0">
          <span className="text-gray-500 text-sm font-mono shrink-0">/</span>
          <input
            value={c.more_page}
            onChange={(e) => onUpdate({ more_page: e.target.value })}
            placeholder="overview"
            aria-label="More link target slug"
            title="Slug of the page the More button opens, e.g. overview or files"
            className="glass-field font-mono flex-1 min-w-0"
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
          More opens <code className="font-mono text-sky-300 break-all">/{(c.more_page.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_INSTANCE_CONTROLS.more_page)}</code>. Use a page Path or a built-in (overview, ports, sftp, files, terminal). Unknown slugs fall back to Overview.
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
  const off = (Object.keys(d) as (keyof InstanceControls)[])
    .filter((k) => k !== 'shortcuts' && c[k] !== d[k])
    .map(String);
  for (const k of SHORTCUT_KEYS) {
    if (isShortcutCustom(c.shortcuts[k], d.shortcuts[k])) off.push(`shortcuts.${k}`);
  }
  if (off.length === 0) return 'allow-all (nothing restricted)';
  return `${off.length} restriction${off.length === 1 ? '' : 's'}: ${off.join(', ')}`;
}
