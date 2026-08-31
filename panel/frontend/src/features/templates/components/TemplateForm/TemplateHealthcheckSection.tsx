import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { Healthcheck } from '@/features/templates/types/templateForm';

export interface HealthcheckInput extends Healthcheck {}

export interface HealthcheckSectionProps {
  healthcheck: HealthcheckInput;
  onHealthcheckUpdate: (patch: Partial<HealthcheckInput>) => void;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplateHealthcheckSection: React.FC<HealthcheckSectionProps> = ({
  healthcheck,
  onHealthcheckUpdate,
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => (
  <>
    {/* Section H: Healthcheck */}
    <div className={sectionCls}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section H · Healthcheck</h4>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <button type="button" onClick={() => onHealthcheckUpdate({ enabled: !healthcheck.enabled })} className={`relative w-9 h-5 rounded-full transition ${healthcheck.enabled ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={healthcheck.enabled}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${healthcheck.enabled ? 'translate-x-4' : ''}`} />
          </button>
          <span className="text-sm text-gray-300">Enable</span>
        </label>
      </div>
      {healthcheck.enabled && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Test command</label>
            <input value={healthcheck.test_command} onChange={(e) => onHealthcheckUpdate({ test_command: e.target.value })} placeholder="CMD-SHELL curl -f http://localhost:8080/health || exit 1" className={monoCls} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className={labelCls}>Interval (s)</label>
              <input value={healthcheck.interval_s} onChange={(e) => onHealthcheckUpdate({ interval_s: e.target.value })} placeholder="30" className={monoCls} />
            </div>
            <div>
              <label className={labelCls}>Timeout (s)</label>
              <input value={healthcheck.timeout_s} onChange={(e) => onHealthcheckUpdate({ timeout_s: e.target.value })} placeholder="5" className={monoCls} />
            </div>
            <div>
              <label className={labelCls}>Start period (s)</label>
              <input value={healthcheck.start_period_s} onChange={(e) => onHealthcheckUpdate({ start_period_s: e.target.value })} placeholder="10" className={monoCls} />
            </div>
            <div>
              <label className={labelCls}>Retries</label>
              <input value={healthcheck.retries} onChange={(e) => onHealthcheckUpdate({ retries: e.target.value })} placeholder="3" className={monoCls} />
            </div>
          </div>
          <p className="text-xs text-gray-500">The container is restarted automatically when this check fails repeatedly.</p>
        </div>
      )}
    </div>
  </>
);