import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import GlassField, { glassFieldClass } from '@/shared/components/ui/Field';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';
import { createNotification } from '../api/notifications';
import { useAuthStore } from '@/shared/stores/authStore';
import { PERMISSION_AREAS, hasAreaAccess } from '@/shared/types/permissions';

const NotificationBroadcast: React.FC = () => {
  const navigate = useNavigate();
  const permissions = useAuthStore((s) => s.permissions);
  // Same rule as the inbox broadcast button + backend POST gate:
  // umbrella MANAGE_NOTIFICATIONS OR granular NOTIFICATIONS_CREATE.
  const notificationsArea = useMemo(
    () => PERMISSION_AREAS.find((a) => a.label === 'Notifications')!,
    [],
  );
  const canBroadcast = useMemo(
    () => hasAreaAccess(permissions, notificationsArea, 'CREATE'),
    [permissions, notificationsArea],
  );

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [priority, setPriority] = useState<string>('normal');
  const [link, setLink] = useState('');
  const [actionLabel, setActionLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!canBroadcast) {
    return (
      <FormPage
        crumbs={[{ label: 'Notifications', to: '/notifications' }, { label: 'Broadcast' }]}
        submitLabel={undefined}
        hideHeader
      >
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          You do not have permission to broadcast. Requires <code className="text-white">MANAGE_NOTIFICATIONS</code> or <code className="text-white">NOTIFICATIONS_CREATE</code>.
        </div>
      </FormPage>
    );
  }

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createNotification({
        title: title.trim(),
        message,
        category: category as any,
        priority: priority as any,
        link: link.trim() || undefined,
        action_label: actionLabel.trim() || undefined,
        broadcast: true,
      });
      navigate('/notifications');
    } catch (err: any) {
      setError(err?.response?.data || 'Failed to broadcast');
    } finally {
      setSaving(false);
    }
  };

  const titleLen = title.length;
  const msgLen = message.length;

  return (
    <>
      {/* Top-right actions — "Broadcast" title lives in the app header
          ("Notifications / Broadcast"). Footer Cancel/Broadcast removed;
          everything lives here. */}
      <PageActionsPill>
          <button
            type="button"
            onClick={() => navigate('/notifications')}
            title="Cancel and back to Notifications"
            aria-label="Cancel and back to Notifications"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit()}
            disabled={saving}
            title="Broadcast to all users"
            className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {saving ? 'Sending…' : 'Broadcast to all'}
          </button>
      </PageActionsPill>
      <FormPage
        crumbs={[{ label: 'Notifications', to: '/notifications' }, { label: 'Broadcast' }]}
        onSubmit={onSubmit}
        maxWidth="max-w-3xl"
        hideHeader
      >
      <div className="space-y-5">
        {/* Intro */}
        <div className="rounded-xl border border-fuchsia-400/15 bg-fuchsia-500/10 p-4 flex gap-3">
          <span className="shrink-0 w-9 h-9 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/30 grid place-items-center text-fuchsia-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7 6 6 6 10" />
              <path d="M12 8a6 6 0 0 1 6 6" />
              <path d="M4 12a8 8 0 0 0 2.5 5.8" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-fuchsia-100">Broadcast notification</p>
            <p className="text-xs text-fuchsia-200/70 mt-1">
              This sends a notification to <span className="text-white font-semibold">every user</span> on the panel (fan-out: one row per user). Use it for maintenance windows, security alerts, or announcements. The sender is recorded as you.
            </p>
          </div>
        </div>

        <div className="ks-card ks-form-card rounded-md space-y-4">
          <GlassField
            label="Title *"
            htmlFor="bcast-title"
            hint={`${titleLen} / 500 — concise subject, shown as the notification headline.`}
          >
            <input
              id="bcast-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Maintenance in 10 minutes"
              maxLength={500}
              required
            />
          </GlassField>

          <GlassField
            label="Message"
            htmlFor="bcast-msg"
            hint={`${msgLen} / 5000 — detailed body, supports plain text. Shown on the notification card.`}
          >
            <textarea
              id="bcast-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="We will restart the panel in 10 minutes. Save your work."
              rows={4}
              maxLength={5000}
            />
          </GlassField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GlassField label="Category" htmlFor="bcast-category" hint="Used for filtering and badge colour.">
              <select
                id="bcast-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={glassFieldClass}
              >
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </GlassField>

            <GlassField label="Priority" htmlFor="bcast-priority" hint="Controls dot colour and urgency.">
              <select
                id="bcast-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={glassFieldClass}
              >
                {Object.entries(PRIORITY_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </GlassField>
          </div>

          <GlassField
            label="Link (optional)"
            htmlFor="bcast-link"
            hint="If set, the card shows an Open button to this URL. Can be /system or https://… (1000 chars max)."
          >
            <input
              id="bcast-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/system or https://example.com/notice"
              maxLength={1000}
              className={glassFieldClass + ' font-mono text-xs'}
            />
          </GlassField>

          <GlassField
            label="Action label"
            htmlFor="bcast-label"
            hint="Button text when link is set. Defaults to Open. (255 chars max)"
          >
            <input
              id="bcast-label"
              value={actionLabel}
              onChange={(e) => setActionLabel(e.target.value)}
              placeholder="Open dashboard"
              maxLength={255}
              className={glassFieldClass}
            />
          </GlassField>
        </div>

        {/* Live preview — mirrors NotificationCard layout */}
        <div className="ks-card ks-form-card rounded-md space-y-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Preview</p>
          <article className="flex flex-col gap-3 p-4 rounded-xl border glass-card bg-sky-500/[0.04] border-sky-400/25">
            <header className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border bg-sky-500/15 border-sky-400/20 text-sky-300">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-5 h-5">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">{title.trim() || 'Your broadcast title will appear here'}</h3>
                <p className="text-[11px] text-gray-500 font-mono mt-0.5 flex items-center gap-1.5">
                  <span>just now</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-200 text-[10px] font-bold uppercase tracking-wide">Broadcast</span>
                </p>
              </div>
            </header>
            <p className="text-sm text-gray-300 leading-relaxed bg-black/20 border border-white/[0.04] rounded-lg px-3 py-2 line-clamp-3">
              {message.trim() || 'Your message body will appear here. Keep it concise but informative.'}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-md border bg-white/[0.05] border-white/10"
                style={{ color: (CATEGORY_META[category as keyof typeof CATEGORY_META] || CATEGORY_META.general).color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: (CATEGORY_META[category as keyof typeof CATEGORY_META] || CATEGORY_META.general).color }} />
                {(CATEGORY_META[category as keyof typeof CATEGORY_META] || CATEGORY_META.general).label}
              </span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border ${(PRIORITY_META[priority as keyof typeof PRIORITY_META] || PRIORITY_META.normal).bg} ${(PRIORITY_META[priority as keyof typeof PRIORITY_META] || PRIORITY_META.normal).color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${(PRIORITY_META[priority as keyof typeof PRIORITY_META] || PRIORITY_META.normal).dot}`} />
                {(PRIORITY_META[priority as keyof typeof PRIORITY_META] || PRIORITY_META.normal).label}
              </span>
            </div>
            {link.trim() && (
              <footer className="pt-2 border-t border-white/[0.06]">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white px-3 py-1.5 rounded-md">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  {actionLabel.trim() || 'Open'}
                </span>
                <span className="ml-2 text-xs font-mono text-gray-500 truncate">{link.trim()}</span>
              </footer>
            )}
          </article>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">{error}</div>
        )}
      </div>
      </FormPage>
    </>
  );
};

export default NotificationBroadcast;
