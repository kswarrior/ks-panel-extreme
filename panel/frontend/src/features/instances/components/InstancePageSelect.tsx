import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstance } from '@/shared/hooks/useInstance';
import { resolveInstanceControls } from '../utils/instanceControls';
import type { ResolvedNavEntry } from '@/shared/utils/instancePages';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import OverviewSectionSelect, { type OverviewSectionDef } from './OverviewSectionSelect';

// InstancePageSelect — the instance page switcher (control pages, native
// tool pages and the instance's own custom pages) rendered inside the
// floating Instance controls menu. It used to live in the header; the menu
// now owns instance navigation so the header stays just the instance id.
//
// Sections are derived from the instance's own `instance_controls` allow-
// list snapshot plus its resolved nav pages, so a template can hide
// individual entries exactly as it can hide the pages themselves.

const controlIcon = (paths: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">{paths}</svg>
);

const CONTROL_PAGE_META: Record<string, { label: string; hint: string; accent: string; icon: React.ReactNode }> = {
  details: {
    label: 'Details',
    hint: 'Facts & timestamps',
    accent: '#38bdf8',
    icon: controlIcon(<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>),
  },
  monitoring: {
    label: 'Monitoring',
    hint: 'CPU · RAM · disk',
    accent: '#34d399',
    icon: controlIcon(<><path d="M12 20a8 8 0 1 1 8-8" /><path d="M12 12l4-4" /></>),
  },
  manage: {
    label: 'Manage',
    hint: 'Rename · reinstall · destroy',
    accent: '#fbbf24',
    icon: controlIcon(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />),
  },
  activity: {
    label: 'Activity',
    hint: 'Audit trail',
    accent: '#a78bfa',
    icon: controlIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  },
  terminal: {
    label: 'Terminal',
    hint: 'Live terminal consoles',
    accent: '#f472b6',
    icon: controlIcon(<><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>),
  },
  files: {
    label: 'Files',
    hint: 'File manager',
    accent: '#22d3ee',
    icon: controlIcon(<><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /></>),
  },
  sftp: {
    label: 'SFTP',
    hint: 'SFTP access',
    accent: '#fb923c',
    icon: controlIcon(<><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="16" r="1" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  },
  ports: {
    label: 'Ports',
    hint: 'Host → container mappings',
    accent: '#f87171',
    icon: controlIcon(<><rect x="2" y="7" width="20" height="8" rx="2" /><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /><path d="M6 15v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" /></>),
  },
  automation: {
    label: 'Automation',
    hint: 'Scheduled jobs & runs',
    accent: '#fbbf24',
    icon: controlIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="m17 3 2 2" /><path d="m7 3-2 2" /></>),
  },
};

function customNavIcon(n: ResolvedNavEntry): React.ReactNode {
  const raw = n.iconKind === 'svg' && n.iconSvg ? sanitizeSvgIcon(n.iconSvg) : '';
  if (!raw) return controlIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>);
  if (raw.trim().toLowerCase().startsWith('<svg')) {
    return <span className="flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4 [&>svg]:block" dangerouslySetInnerHTML={{ __html: raw }} />;
  }
  return controlIcon(<g dangerouslySetInnerHTML={{ __html: raw }} />);
}

export interface InstancePageSelectProps {
  instanceId: number;
  activeSlug: string;
  nav: ResolvedNavEntry[];
  /** Stretch the trigger to fill the menu row. */
  fullWidth?: boolean;
}

const InstancePageSelect: React.FC<InstancePageSelectProps> = ({
  instanceId,
  activeSlug,
  nav,
  fullWidth = false,
}) => {
  const navigate = useNavigate();
  const { instance } = useInstance(instanceId);
  const controls = React.useMemo(() => resolveInstanceControls(instance?.config), [instance?.config]);
  const sections = React.useMemo<OverviewSectionDef[]>(() => {
    const out: OverviewSectionDef[] = [];
    const addBuiltin = (id: string) => {
      const meta = CONTROL_PAGE_META[id];
      if (meta) out.push({ id, ...meta });
    };
    if (controls.show_details_tab) addBuiltin('details');
    if (controls.show_monitoring_tab) addBuiltin('monitoring');
    if (controls.show_manage_tab) addBuiltin('manage');
    if (controls.show_activity_tab) addBuiltin('activity');
    if (controls.show_terminal_page) addBuiltin('terminal');
    if (controls.show_files_page) addBuiltin('files');
    if (controls.show_ports_page) addBuiltin('ports');
    if (controls.show_automation_page) addBuiltin('automation');
    addBuiltin('sftp');
    for (const n of nav) {
      if (!n.to || CONTROL_PAGE_META[n.to]) continue;
      out.push({
        id: n.to,
        label: n.label,
        hint: 'Instance page',
        icon: customNavIcon(n),
        accent: n.iconColor || '#94a3b8',
      });
    }
    return out;
  }, [controls, nav]);
  if (sections.length === 0) return null;
  // Sub-pages (automation/edit) keep their family entry highlighted.
  const rootSlug = activeSlug.split('/')[0];
  const active = sections.some((s) => s.id === rootSlug) ? rootSlug : sections[0].id;
  return (
    <OverviewSectionSelect
      ariaLabel="Instance pages"
      active={active}
      onChange={(id) => {
        navigate(id === '.' ? `/instances/${instanceId}` : `/instances/${instanceId}/${id}`);
      }}
      sections={sections}
      fullWidth={fullWidth}
    />
  );
};

export default InstancePageSelect;
