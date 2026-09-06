import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTicketSLAConfig, updateTicketSLAConfig } from '../api/tickets';
import type { TicketSLAConfig } from '../types/ticket';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

// TicketSchedules — the ticket "schedule" is the per-priority SLA clock:
// first-response minutes + resolution hours drive breach/escalation.
// Mirrors TicketSLAConfig exactly:
//   Record<priority, { first_response_mins: number; resolve_hours: number }>
const TicketSchedules: React.FC = () => {
  const [draft, setDraft] = useState<TicketSLAConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDraft(await getTicketSLAConfig());
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to load SLA config'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setRow = (priority: string, patch: Partial<{ first_response_mins: number; resolve_hours: number }>) => {
    setDraft((d) => ({ ...d, [priority]: { ...d[priority], ...patch } }));
    setSaved('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      setDraft(await updateTicketSLAConfig(draft));
      setSaved('SLA config saved.');
    } catch (e: any) {
      setError(getErrorMessage(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="glass-card rounded-xl animate-pulse h-24" />;
  }

  const rows = Object.entries(draft).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/tickets" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Tickets">
          Tickets
        </Link>
        <Link to="/tickets/stats" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Ticket statistics">
          Stats
        </Link>
      </PageActionsPill>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {saved && <p className="text-emerald-300 text-sm">{saved}</p>}

      <GlassCard variant="form" className="space-y-3">
        <h3 className="text-sm font-semibold text-white">SLA clocks by priority</h3>
        {rows.length === 0 && (
          <p className="text-sm text-gray-500">No SLA rows configured — tickets have no breach clock.</p>
        )}
        {rows.map(([priority, cfg]) => (
          <div key={priority} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end rounded-lg border border-white/10 bg-black/30 px-3 py-2">
            <div className="text-sm text-white font-medium capitalize">{priority}</div>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">First response (mins)</span>
              <input
                type="number"
                min={0}
                value={cfg.first_response_mins}
                onChange={(e) => setRow(priority, { first_response_mins: Number(e.target.value) })}
                className="w-full glass-field text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Resolve (hours)</span>
              <input
                type="number"
                min={0}
                value={cfg.resolve_hours}
                onChange={(e) => setRow(priority, { resolve_hours: Number(e.target.value) })}
                className="w-full glass-field text-sm"
              />
            </label>
          </div>
        ))}
        <div className="flex items-center justify-end">
          <button onClick={save} disabled={saving} className="ks-primary-btn px-3 py-1.5 rounded text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </GlassCard>

      <GlassCard>
        <p className="text-sm text-gray-400">
          Breach and escalation timers run off this config. See live breach
          counts on the <Link to="/tickets" className="text-sky-300 hover:text-sky-200 underline">tickets</Link> and{' '}
          <Link to="/tickets/stats" className="text-sky-300 hover:text-sky-200 underline">ticket stats</Link> pages.
        </p>
      </GlassCard>
    </div>
  );
};

export default TicketSchedules;
