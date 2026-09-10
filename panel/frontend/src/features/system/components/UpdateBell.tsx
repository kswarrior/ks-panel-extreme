import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { hasPermissionAny } from '@/shared/types/permissions';
import { checkUpdate } from '@/shared/api/admin';
import type { UpdateCheckResponse } from '@/features/system/types/system';
import RichMenu, { type RichMenuItem } from '@/shared/components/ui/RichMenu';

// Local-storage keys for the header update bell. Dismissal is pinned to the
// remote version (a newer release re-arms the bell); snooze stores an epoch
// timestamp the bell stays hidden until (24h nap).
const DISMISSED_KEY = 'kspanel.update-bell.dismissed';
const SNOOZE_KEY = 'kspanel.update-bell.snooze';
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function readLS(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage off: dismissal becomes session-only (bell re-arms on reload).
  }
}

// UpdateBell — header update-found indicator, rendered left of the
// notification bell. Visible ONLY when all of these hold (fail closed):
//   1. the caller holds MANAGE_PANEL_UPDATE (the update-check endpoints
//      403 without it, so lesser roles must never see the bell),
//   2. a remote version.json check reports an update is available,
//   3. the admin hasn't dismissed this version or snoozed the bell.
// Clicking the bell opens a dropdown: go to System to update, remind me
// later (24h), or don't show again for this version.
const UpdateBell: React.FC = () => {
  const navigate = useNavigate();
  const permissions = useAuthStore((s) => s.permissions);
  const canSee = hasPermissionAny(permissions, 'MANAGE_PANEL_UPDATE');

  const [check, setCheck] = useState<UpdateCheckResponse | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!canSee || hidden) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await checkUpdate();
        if (cancelled) return;
        if (!r?.available) return;
        const remote = (r.remote?.version || '').trim();
        if (remote && readLS(DISMISSED_KEY) === remote) return;
        const snoozeUntil = Number(readLS(SNOOZE_KEY) || '0');
        if (Number.isFinite(snoozeUntil) && Date.now() < snoozeUntil) return;
        setCheck(r);
      } catch {
        // Fail closed: backend refusal / network error hides the bell.
        if (!cancelled) setCheck(null);
      }
    })();
    return () => { cancelled = true; };
  }, [canSee, hidden]);

  const snooze = useCallback(() => {
    writeLS(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setCheck(null);
    setHidden(true);
  }, []);

  const dismiss = useCallback(() => {
    const remote = (check?.remote?.version || '').trim();
    if (remote) writeLS(DISMISSED_KEY, remote);
    setCheck(null);
    setHidden(true);
  }, [check]);

  const goSystem = useCallback(() => {
    navigate('/system');
  }, [navigate]);

  const onSelect = useCallback((key: string) => {
    if (key === 'go-system') goSystem();
    else if (key === 'snooze') snooze();
    else if (key === 'dismiss') dismiss();
  }, [goSystem, snooze, dismiss]);

  if (!canSee || !check?.available) return null;

  const remote = (check.remote?.version || '').trim() || 'new version';
  const items: RichMenuItem[] = [
    { key: 'go-system', label: 'Go to System to update…' },
    { key: 'snooze', label: 'Remind me later' },
    { key: 'dismiss', label: "Don't show again" },
  ];

  return (
    <RichMenu
      items={items}
      onSelect={onSelect}
      width={248}
      placement="bottom-right"
      ariaLabel="Panel update available"
      header={
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">Update available</p>
          <p className="text-xs text-gray-300/80 truncate">v{remote} is ready to install</p>
        </div>
      }
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-label={`Panel update available (v${remote})`}
          title={`Panel update available (v${remote})`}
          className="ks-icon-btn relative inline-flex items-center justify-center w-9 h-9 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v5h-5" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
        </button>
      )}
    />
  );
};

export default UpdateBell;
