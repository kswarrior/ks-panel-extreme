import React, { useEffect, useRef } from 'react';
import type { StackOpJob, StackOpStepState } from '@/features/stacks/api/stacks';

interface StackOpModalProps {
  job: StackOpJob | null;
  stackName: string;
  stopping: boolean;
  onStop: () => void;
  // Dismiss only hides the console — a running job keeps going on the
  // server (polling continues in the background, result notice on finish).
  onDismiss: () => void;
}

const OP_TITLE: Record<string, string> = {
  install: 'Installing',
  launch: 'Launching',
  reinstall: 'Reinstalling',
};

const STEP_DOT: Record<StackOpStepState, string> = {
  pending: 'bg-white/10 border-white/15',
  running: 'bg-sky-400 border-sky-400 animate-pulse',
  done: 'bg-emerald-400 border-emerald-400',
  error: 'bg-red-400 border-red-400',
  skipped: 'bg-white/5 border-white/10',
};

const STATUS_BADGE: Record<string, string> = {
  running: 'bg-sky-900/40 border-sky-700/40 text-sky-200',
  done: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-200',
  error: 'bg-red-900/40 border-red-700/40 text-red-200',
  cancelled: 'bg-amber-900/40 border-amber-700/40 text-amber-200',
};

// StackOpModal — operation console sub-page for install / launch /
// reinstall: live step checklist + streaming log tail. The ✕ top-right
// only dismisses the view (a running job continues); Stop kills it.
const StackOpModal: React.FC<StackOpModalProps> = ({ job, stackName, stopping, onStop, onDismiss }) => {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.logs.length, job?.job_id]);

  // Esc dismisses like ✕ (never kills).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (!job) return null;
  const running = job.status === 'running';
  const title = `${OP_TITLE[job.op] || job.op} ${stackName}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onDismiss}
    >
      <div
        className="ks-card w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: spinner + title + status, ✕ dismisses (job survives). */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10 shrink-0">
          {running ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin shrink-0" aria-label="running" />
          ) : (
            <span className={`w-3 h-3 rounded-full shrink-0 border ${STEP_DOT[job.status === 'done' ? 'done' : job.status === 'error' ? 'error' : 'skipped']}`} aria-hidden="true" />
          )}
          <h3 className="text-sm font-semibold text-white truncate flex-1 min-w-0">{title}</h3>
          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${STATUS_BADGE[job.status] || STATUS_BADGE.running}`}>
            {job.status}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            title={running ? 'Hide console (operation keeps running)' : 'Close'}
            aria-label="Hide console"
            className="w-8 h-8 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Steps */}
        <div className="px-4 pt-3 shrink-0">
          <ol className="space-y-1">
            {job.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                {s.state === 'running' ? (
                  <span className="w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin shrink-0" />
                ) : (
                  <span className={`w-3 h-3 rounded-full border shrink-0 ${STEP_DOT[s.state]}`} aria-hidden="true" />
                )}
                <span className={`truncate min-w-0 ${s.state === 'pending' || s.state === 'skipped' ? 'text-gray-500' : 'text-gray-200'}`} title={s.name}>
                  {i + 1}. {s.name}
                </span>
                {s.detail && <span className="text-[11px] text-gray-500 font-mono truncate">— {s.detail}</span>}
              </li>
            ))}
          </ol>
        </div>

        {/* Log tail */}
        <div className="px-4 py-3 min-h-0 flex-1 flex flex-col">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 shrink-0">Log</p>
          <pre
            ref={logRef}
            className="flex-1 min-h-[10rem] max-h-[40vh] overflow-auto rounded-lg border border-white/5 bg-black/40 p-3 text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all"
          >
            {(job.logs || []).join('\n') || '—'}
          </pre>
          {job.status === 'error' && job.error && (
            <p className="text-xs text-red-300 mt-2 shrink-0">{job.error}</p>
          )}
          {job.status === 'cancelled' && (
            <p className="text-xs text-amber-300 mt-2 shrink-0">Stopped by user — steps after the in-flight one were skipped. Partial effects stand.</p>
          )}
        </div>

        {/* Footer: Stop kills, ✕/Close only hides. */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 shrink-0">
          {running && (
            <p className="text-[11px] text-gray-500 mr-auto">Hiding keeps it running — reopen from the banner.</p>
          )}
          {!running && <span className="mr-auto" />}
          {running ? (
            <button
              type="button"
              onClick={onStop}
              disabled={stopping}
              className="px-4 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
            >
              {stopping ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-1.5 text-xs rounded-lg bg-white text-black hover:bg-gray-200"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StackOpModal;
