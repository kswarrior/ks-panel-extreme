// Settings instance sub-page — built-in page implementation (self-contained).
//
// Renders the instance's editable deployment settings (resources, env, and
// runtime knobs) sourced from the parsed instance config. Moved verbatim
// out of pages/panel/InstanceDetail.tsx; cross-page UI vocabulary
// (Section/InfoRow/Btn/Field, useInstanceFromParams, LoadingOrError, …)
// is imported from ./_shared.
//
// Default export is the BuiltinPageManifestEntry consumed by
// lib/builtin/index.ts; pages/panel/InstanceDetail.tsx re-exports
// InstanceSettings + its boundary-wrapped <InstanceSettingsPage/>.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInstance, parseConfig, extractConfig } from '@/shared/hooks/useInstance';
import type { Instance, DriverKind } from '@/shared/types/instance';
import { listTemplates } from '@/shared/api/admin';
import { isPageAllowed } from '@/shared/utils/instancePages';
import {
  parseBytes, joinPath, timeAgo,
  KIND_BADGE, kindBadgeClass, STATUS_META, statusMeta, KindIcon,
  cleanExternalId, INSTANCE_NAV,
  Section, EmptyRow, InfoRow, inputCls, Btn, Field,
  useInstanceFromParams, PageErrorBoundary, withBoundary,
  LoadingOrError, TableSkeleton, CardGridSkeleton, TilesSkeleton,
  asArray, errText,
} from './_shared';
import type { LoadingKind } from './_shared';
import type { BuiltinPageManifestEntry } from './types';

export const InstanceSettings: React.FC = () => {
  const { instance, loading, error } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  if (loading || error || !instance) return <LoadingOrError loading={loading} error={error} kind="settings" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="settings" />;
  const t = templates.find((x) => x.id === instance.template_id);
  const spec = t ? parseConfig(t.spec) : null;
  if (!isPageAllowed('settings', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }
  const cfg = extractConfig(parseConfig(instance.config));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Settings</h2>
      </div>

      <Section title="Resource limits" description="CPU / memory / disk caps the driver enforces.">
        {cfg.limits.length === 0 ? (
          <EmptyRow text="No resource limits set — the instance runs with the driver's defaults." />
        ) : (
          <dl className="divide-y divide-white/[0.06] -my-1">
            {cfg.limits.map((l) => <InfoRow key={l.key} label={l.key} value={<span className="font-mono text-gray-200 text-xs">{l.value}</span>} />)}
          </dl>
        )}
      </Section>

      <Section title="Environment" description="Variables the driver injected at deploy time.">
        {cfg.env.length === 0 ? (
          <EmptyRow text="No environment variables set." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-gray-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Key</th>
                  <th className="text-left px-3 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {cfg.env.map((e) => (
                  <tr key={e.key} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-2 font-mono text-gray-200 text-xs">{e.key}</td>
                    <td className="px-3 py-2 font-mono text-gray-300 text-xs break-all">{e.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Runtime policy" description="Restart policy and other deploy-time flags.">
        <dl className="divide-y divide-white/[0.06] -my-1">
          <InfoRow label="Restart policy" value={<span className="text-gray-200">{cfg.restart || 'default'}</span>} />
          {cfg.command.length > 0 && <InfoRow label="Command" value={<span className="font-mono text-gray-200 text-xs break-all">{cfg.command.join(' ')}</span>} />}
        </dl>
      </Section>
    </div>
  );
};

const Settings: BuiltinPageManifestEntry = {
  slug: 'settings',
  name: 'Settings',
  iconName: 'Settings',
  iconSvg: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />',
  component: InstanceSettings,
};

export default Settings;
