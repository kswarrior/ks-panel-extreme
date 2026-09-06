import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createTicket, getTicket, updateTicket } from '../api/tickets';
import type { Ticket, TicketCategory, TicketPriority } from '../types/ticket';
import GlassCard from '@/shared/components/ui/Card';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'billing', label: 'Billing' },
  { value: 'technical', label: 'Technical' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'abuse', label: 'Abuse' },
  { value: 'other', label: 'Other' },
];
const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'critical', label: 'Critical' },
];

const TicketForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [tagsStr, setTagsStr] = useState('');
  const [dueAt, setDueAt] = useState('');

  useEffect(() => {
    if (!isEdit || !id) return;
    (async () => {
      try {
        const detail = await getTicket(Number(id));
        const t = detail.ticket;
        setTicket(t);
        setSubject(t.subject);
        setDescription(t.description || '');
        setCategory(t.category as TicketCategory);
        setPriority(t.priority as TicketPriority);
        try {
          const parsed = JSON.parse(t.tags);
          if (Array.isArray(parsed)) setTagsStr(parsed.join(', '));
        } catch {}
        if (t.due_at) {
          const d = new Date(t.due_at);
          if (!Number.isNaN(d.getTime())) {
            const pad = (n: number) => String(n).padStart(2, '0');
            setDueAt(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
          }
        }
      } catch (e: any) {
        setError(e?.response?.data || 'Failed to load ticket');
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [isEdit, id]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    const s = subject.trim();
    if (!s) { setError('Subject is required'); return; }
    if (s.length > 200) { setError('Subject too long'); return; }
    const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length > 20) { setError('Too many tags (max 20)'); return; }
    if (tags.some((t) => t.length > 30)) { setError('Tag too long (max 30 characters each)'); return; }
    if (description.length > 10000) { setError('Description too long (max 10000)'); return; }
    let dueAtISO: string | null = null;
    if (dueAt) {
      const d = new Date(dueAt);
      if (Number.isNaN(d.getTime())) { setError('Invalid due date'); return; }
      dueAtISO = d.toISOString();
    }
    setLoading(true);
    try {
      if (isEdit && id) {
        await updateTicket(Number(id), {
          subject: s,
          description,
          category,
          priority,
          tags,
          due_at: dueAtISO,
        });
        navigate(`/tickets/${id}`);
      } else {
        const created = await createTicket({
          subject: s,
          description,
          category,
          priority,
          tags,
          due_at: dueAtISO,
        });
        navigate(`/tickets/${created.id}`);
      }
    } catch (e: any) {
      setError(e?.response?.data || e?.message || 'Failed to save ticket');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-24 rounded" style={{ background: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))' }} />
          <div className="h-4 w-px" style={{ background: 'var(--ks-card-border)' }} />
          <div className="h-6 w-32 rounded" style={{ background: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))' }} />
        </div>
        <FormSkeleton fields={6} />
        <div className="glass-card rounded-xl p-4 border border-white/5 bg-white/[0.02] animate-pulse space-y-2">
          <div className="h-3 w-40 rounded" style={{ background: 'var(--ks-skeleton-shimmer, #262626)' }} />
          <div className="h-2.5 w-full rounded" style={{ background: 'var(--ks-skeleton-base, #262626)' }} />
          <div className="h-2.5 w-5/6 rounded" style={{ background: 'var(--ks-skeleton-base, #262626)' }} />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Top-right actions — title lives in the app header ("Tickets / New
          Ticket" or "Tickets / Edit Ticket"). Footer Cancel/Create removed;
          everything lives here. */}
      <PageActionsPill>
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            title="Cancel and back to Tickets"
            aria-label="Cancel and back to Tickets"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={loading}
            title={isEdit ? 'Save changes' : 'Create ticket'}
            className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Ticket'}
          </button>
      </PageActionsPill>
      <FormPage
        crumbs={[{ label: 'Tickets', to: '/tickets' }, { label: isEdit ? 'Edit Ticket' : 'New Ticket' }]}
        onSubmit={submit}
        maxWidth="max-w-3xl"
        hideHeader
      >
      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}

      <GlassCard variant="form" className="p-6">
        <div className="space-y-5">
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Subject *</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of the issue…" className="w-full glass-field" required maxLength={200} />
            <p className="text-[11px] text-gray-500 mt-1">{subject.length}/200</p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue in detail, steps to reproduce, expected vs actual behavior…" rows={6} className="w-full glass-field resize-y" maxLength={10000} />
            <p className="text-[11px] text-gray-500 mt-1">{description.length}/10000</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} className="w-full glass-field">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className="w-full glass-field">
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {(priority === 'urgent' || priority === 'critical') && <p className="text-[11px] text-amber-300 mt-1">High priority tickets are triaged faster.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Tags (comma separated)</label>
              <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="billing, urgent, backend" className="w-full glass-field" />
              <p className="text-[11px] text-gray-500 mt-1">Up to 20 tags, 30 chars each.</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Due date (optional)</label>
              <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full glass-field" />
            </div>
          </div>

        </div>
      </GlassCard>

      <div className="mt-4 glass-card rounded-xl p-4 border border-white/5 bg-white/[0.02]">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          Tips for a great ticket
        </h4>
        <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
          <li>Use a clear, searchable subject — e.g. <span className="text-gray-300">“Invoice #1234 charged twice”</span> beats <span className="text-gray-300">“Billing issue”</span>.</li>
          <li>Pick the right category so the ticket routes to the right crew.</li>
          <li>Attach steps, logs or screenshots in the description — copy-paste friendly.</li>
        </ul>
      </div>
      </FormPage>
    </>
  );
};

export default TicketForm;
