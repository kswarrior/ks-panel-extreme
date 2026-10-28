import React from 'react';
import { parse as parseYaml } from 'yaml';
import { useInstance } from '@/shared/hooks/useInstance';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import type { PageContent } from '@/shared/utils/instancePages';

// Raw YAML imported from the canonical instance_pages library so the
// built-in control pages carry the exact authored HTML + theme head.
import terminalYamlRaw from '../../../../../../instance_pages/pages/terminal.yaml?raw';
import filesYamlRaw from '../../../../../../instance_pages/pages/files.yaml?raw';

const RAW: Record<string, string> = {
  terminal: terminalYamlRaw,
  files: filesYamlRaw,
};

function buildContent(slug: string): PageContent | null {
  const raw = RAW[slug];
  if (!raw) return null;
  let doc: any = null;
  try {
    doc = parseYaml(raw);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object') return null;
  const ct = String(doc.content_type || 'html').toLowerCase();
  const type = (ct === 'markdown' || ct === 'blocks' || ct === 'react' || ct === 'html') ? ct : 'html';
  const content: PageContent = { type: type as any };
  if (type === 'html') content.html = String(doc.content_html || '');
  if (type === 'markdown') content.markdown = String(doc.content_markdown || doc.content_html || '');
  if (type === 'blocks') content.blocks = String(doc.content_blocks || '');
  if (Array.isArray(doc.actions)) content.actions = doc.actions;
  if (Array.isArray(doc.components)) content.components = doc.components;
  if (Array.isArray(doc.configure)) content.configure = doc.configure;
  if (doc.config && typeof doc.config === 'object') content.config = doc.config;
  return content;
}

const InstanceYamlPage: React.FC<{ instanceId: number; slug: 'terminal' | 'files' }> = ({ instanceId, slug }) => {
  const { instance, loading } = useInstance(instanceId);
  const content = React.useMemo(() => buildContent(slug), [slug]);
  if (loading) {
    return <div className="glass-card rounded-xl flex items-center gap-4 animate-pulse"><div className="w-9 h-9 rounded-lg bg-neutral-800 shrink-0" /><div className="h-5 w-1/3 bg-neutral-800 rounded" /></div>;
  }
  if (!instance || !content) {
    return <div className="ks-card ks-form-card rounded-xl text-center text-gray-400"><p className="text-sm">Page unavailable.</p></div>;
  }
  const instanceContext = {
    id: instance.id,
    name: instance.name,
    kind: instance.kind,
    status: instance.status,
    template_id: instance.template_id,
    template_name: instance.template_name ?? null,
    node_id: instance.node_id,
    node_name: instance.node_name ?? null,
    owner_id: instance.owner_id ?? null,
    owner_name: instance.owner_name ?? null,
    config: instance.config ? (instance.config as any) : {},
    external_id: instance.external_id ?? '',
    created_at: instance.created_at ?? '',
    updated_at: instance.updated_at ?? '',
    install_state: instance.install_state ?? '',
    install_kind: instance.install_kind ?? '',
    install_step: typeof instance.install_step === 'number' ? instance.install_step : -1,
    install_error: instance.install_error ?? '',
    install_steps_json: instance.install_steps_json ?? '',
    install_action_id: instance.install_action_id ?? '',
    display_name: instance.display_name ?? '',
    icon: instance.icon ?? '',
    color: instance.color ?? '',
  };
  return (
    <CustomPageView content={content} title={slug === 'terminal' ? 'Terminal' : 'Files'} instanceContext={instanceContext as any} pageSlug={slug} />
  );
};

export default InstanceYamlPage;
