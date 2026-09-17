import React from 'react';
import type { AutoRestart } from '@/features/templates/types/templateForm';

export interface TemplateRestartSectionProps {
  autoRestart: AutoRestart;
  onUpdate: (patch: Partial<AutoRestart>) => void;
  sectionCls: string;
  labelCls: string;
}

export const TemplateRestartSection: React.FC<TemplateRestartSectionProps> = ({
  autoRestart,
  onUpdate,
  sectionCls,
}) => {
  const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition ${checked ? 'bg-sky-600' : 'bg-neutral-700'}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  );

  return (
    <div className={sectionCls}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section R · Auto Start</h4>
      <p className="text-xs text-gray-500 mb-3">
        Decide when the panel should automatically restart an instance without operator action. The reconciliation loop checks live edge status every ~15s.
      </p>

      <div className="space-y-4">
        <div className="border border-white/10 rounded-md p-3 bg-black/20 space-y-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-300">After exit</h5>
          <Toggle checked={autoRestart.on_stop} onChange={(v) => onUpdate({ on_stop: v })} label="Auto start if stopped normally (exit 0 / docker stop)" />
          <Toggle checked={autoRestart.on_crash} onChange={(v) => onUpdate({ on_crash: v })} label="Auto start if crashed (non-zero exit / OOM / killed)" />
          <p className="text-[11px] text-gray-500">Both watch the edge&apos;s real container state. When the panel sees <code className="font-mono text-gray-400">running → stopped</code> it immediately re-starts if the matching toggle is on. Disabled = the instance stays stopped until an operator clicks Start.</p>
        </div>

        <div className="border border-white/10 rounded-md p-3 bg-black/20 space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-300">When edge comes back online</h5>
          <p className="text-[11px] text-gray-500">If the edge host reboots or the node was offline, what should happen once the panel can reach the edge again and the container is found stopped?</p>
          <div className="grid grid-cols-1 gap-2">
            {([
              { value: 'off', label: 'Do nothing', desc: 'Instance stays stopped — operator must start manually.' },
              { value: 'was_running', label: 'Start if it was running before the outage', desc: 'Resurrect only instances that were running when the edge went down.' },
              { value: 'always', label: 'Always start', desc: 'Every instance with this template starts, even if it was stopped before the edge went down.' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onUpdate({ on_edge_online: opt.value })}
                className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${autoRestart.on_edge_online === opt.value ? 'border-sky-400/60 bg-sky-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}
                role="radio"
                aria-checked={autoRestart.on_edge_online === opt.value}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${autoRestart.on_edge_online === opt.value ? 'bg-sky-300' : 'bg-gray-600'}`} />
                  <span className="text-sm text-gray-200">{opt.label}</span>
                  {autoRestart.on_edge_online === opt.value && <span className="ml-auto text-sky-300 text-xs">✓</span>}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-gray-500 border border-amber-700/30 bg-amber-950/20 rounded px-3 py-2">
          Tip: <span className="text-amber-200">Restart policy</span> is stored in the template spec and snapshotted into each instance&apos;s config at deploy time. Editing the template does not retroactively change already-deployed instances — use the instance&apos;s own Auto Start card to adjust a live instance.
        </div>
      </div>
    </div>
  );
};
