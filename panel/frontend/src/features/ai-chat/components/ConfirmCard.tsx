import React from 'react';
import type { AIConfirmationTicket } from '../api/aiChat';

interface ConfirmCardProps {
  ticket: AIConfirmationTicket;
  busy: boolean;
  onApprove: () => void;
  onDeny: () => void;
}

// Approve/Deny card for an AI-proposed write. Approve executes server-side
// (permissions re-checked, activity logged); Deny discards the ticket and
// changes nothing.
const ConfirmCard: React.FC<ConfirmCardProps> = ({ ticket, busy, onApprove, onDeny }) => (
  <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 space-y-2">
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200">
        Approval needed
      </span>
      <span className="text-[11px] text-gray-400 font-mono">{ticket.tool}</span>
    </div>
    <p className="text-sm text-gray-100 leading-snug">{ticket.summary}</p>
    {ticket.diff && (
      <pre className="max-h-40 overflow-auto rounded-md bg-black/40 p-2 text-[11px] leading-relaxed text-gray-300 whitespace-pre-wrap break-words">
        {ticket.diff}
      </pre>
    )}
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onDeny}
        disabled={busy}
        className="px-3 py-1.5 text-xs rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white transition-colors disabled:opacity-60"
      >
        Deny
      </button>
      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-60"
      >
        {busy ? 'Working…' : 'Approve'}
      </button>
    </div>
  </div>
);

export default ConfirmCard;
