import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  listInstancePages,
  createInstancePage,
  updateInstancePage,
  executePageAction,
  type InstancePageAction,
} from '@/shared/api/admin';
import type { InstancePage, CreateInstancePagePayload, UpdateInstancePagePayload } from '@/shared/types/instancePage';
import GlassCard from '@/shared/components/ui/Card';
import { glassFieldClass } from '@/shared/components/ui/Field';

type TabId = 'editor' | 'actions' | 'preview' | 'settings';

const TAB_CONFIG: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'editor', label: 'Editor', icon: <EditorIcon /> },
  { id: 'actions', label: 'Actions', icon: <TerminalIcon /> },
  { id: 'preview', label: 'Preview', icon: <PreviewIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

interface PageActionEditor {
  id: string;
  name: string;
  type: InstancePageAction['type'];
  command: string;
  path: string;
  content: string;
  args: string;
  env: string;
  timeout: string;
  description: string;
}

function EditorIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/> </svg>;
}
function TerminalIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/> </svg>;
}
function PreviewIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/> </svg>;
}
function SettingsIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/> </svg>;
}

const InstancePageStudio: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const pageId = id ? Number(id) : null;

  const [activeTab, setActiveTab] = useState<TabId>('editor');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ stdout: string; stderr: string; exit_code: number } | null>(null);

  // Page metadata
  const [page, setPage] = useState<Partial<InstancePage>>({
    name: '',
    description: '',
    slug: '',
    kind: 'custom' as 'builtin' | 'custom',
    category: '',
    content_type: 'html',
    content_html: '',
    content_markdown: '',
    content_blocks: '',
    icon_svg: '',
  });

  const isBuiltin = page.kind === 'builtin';

  // Actions
  const [actions, setActions] = useState<PageActionEditor[]>([
    { id: '1', name: '', type: 'shell', command: '', path: '', content: '', args: '', env: '{}', timeout: '30', description: '' },
  ]);

  // Code editor
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [editorMode, setEditorMode] = useState<'html' | 'markdown' | 'blocks'>('html');

  // Load page if editing
  useEffect(() => {
    if (!isEdit || pageId == null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    listInstancePages()
      .then((pages) => {
        if (cancelled) return;
        const found = pages.find((p) => p.id === pageId);
        if (found) {
          setPage(found);
          setEditorMode(found.content_type as 'html' | 'markdown' | 'blocks');
        } else {
          setError('Instance page not found');
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.response?.data || 'Failed to load page');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pageId, isEdit]);

  // Safety: ensure loading is false after mount for new pages
  useEffect(() => {
    if (!isEdit) {
      setLoading(false);
    }
  }, [isEdit]);

  const currentContent = useMemo(() => {
    if (page.content_type === 'html') return page.content_html;
    if (page.content_type === 'markdown') return page.content_markdown;
    return page.content_blocks;
  }, [page.content_type, page.content_html, page.content_markdown, page.content_blocks]);

  const onChange = <K extends keyof InstancePage>(key: K, value: InstancePage[K]) => {
    setPage((p) => ({ ...p, [key]: value }));
  };

  const handleContentChange = (value: string) => {
    if (page.content_type === 'html') onChange('content_html', value);
    else if (page.content_type === 'markdown') onChange('content_markdown', value);
    else onChange('content_blocks', value);
  };

  const addAction = () => {
    setActions((a) => [...a, { id: Date.now().toString(), name: '', type: 'shell', command: '', path: '', content: '', args: '', env: '{}', timeout: '30', description: '' }]);
  };

  const removeAction = (actionId: string) => {
    if (actions.length <= 1) return;
    setActions((a) => a.filter((x) => x.id !== actionId));
  };

  const updateAction = (actionId: string, patch: Partial<PageActionEditor>) => {
    setActions((a) => a.map((x) => x.id === actionId ? { ...x, ...patch } : x));
  };

  const executeAction = async (action: PageActionEditor) => {
    if (!pageId) return;
    setExecutingAction(action.id);
    setActionResult(null);
    try {
      const res = await executePageAction(pageId, {
        type: action.type,
        command: action.command,
        path: action.path,
        content: action.content,
        args: action.args ? action.args.split(' ').filter(Boolean) : [],
        env: action.env ? JSON.parse(action.env) : {},
        timeout: parseInt(action.timeout) || 30,
      });
      setActionResult({ stdout: res.stdout, stderr: res.stderr, exit_code: res.exit_code });
    } catch (e: any) {
      setActionResult({ stdout: '', stderr: e?.response?.data || e.message, exit_code: -1 });
    } finally {
      setExecutingAction(null);
    }
  };

  const handleSave = async () => {
    if (isBuiltin) {
      setError('Built-in pages cannot be edited. Create a custom page instead.');
      return;
    }
    if (!page.name?.trim() || !page.slug?.trim()) {
      setError('Name and slug are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: page.name!,
        description: page.description,
        slug: page.slug!,
        kind: page.kind,
        category: page.category,
        content_type: page.content_type,
        content_html: page.content_html,
        content_markdown: page.content_markdown,
        content_blocks: page.content_blocks,
        icon_svg: page.icon_svg,
      };
      if (isEdit) {
        await updateInstancePage(pageId!, payload as UpdateInstancePagePayload);
      } else {
        await createInstancePage(payload as CreateInstancePagePayload);
      }
      navigate('/instance-pages');
    } catch (e: any) {
      setError(e?.response?.data || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GlassCard className="text-center text-gray-400">Loading…</GlassCard>;

  return (
    <GlassCard className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">
          {isEdit ? 'Edit Instance Page' : 'Create Instance Page'}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving || isBuiltin} className="ks-primary-btn px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50">
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
          </button>
          <button onClick={() => navigate('/instance-pages')} className="px-4 py-2 border border-white/10 text-gray-300 rounded hover:bg-white/10">
            Cancel
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {isBuiltin && isEdit && (
        <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
          <p className="font-semibold">Built-in Page (Read-Only)</p>
          <p className="mt-1">
            Built-in pages are provided by the panel and cannot be edited here. They are automatically available
            in every instance panel. To customize a built-in page for a specific template (rename, change icon,
            enable/disable), use the <strong>Pages</strong> tab in the <strong>Template</strong> editor.
          </p>
        </div>
      )}

      {/* Validate required fields */}
      {!isEdit && (!page.name || !page.slug) && !isBuiltin && (
        <p className="text-amber-300 mb-4 text-sm">Name and slug are required before saving</p>
      )}

      {/* Tab Bar */}
      <div className="mb-6 border-b border-white/10">
        <nav className="flex gap-2 overflow-x-auto pb-1" role="tablist">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => !isBuiltin && setActiveTab(tab.id)}
              disabled={isBuiltin && tab.id !== 'preview'}
              className={`ks-tab shrink-0 flex items-center gap-2 rounded-b-none transition-colors ${
                activeTab === tab.id ? 'ks-tab-active' : ''
              } ${isBuiltin && tab.id !== 'preview' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Panels */}
      <div role="tabpanel">
        {activeTab === 'editor' && (
          <div className="space-y-6">
            {isBuiltin && (
              <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
                <p className="font-semibold">Read-Only View</p>
                <p className="mt-1">
                  Built-in pages cannot be edited. Their content is provided by the panel's built-in components.
                  Use the <strong>Preview</strong> tab to see how they render, or customize them per-template
                  in the <strong>Template → Pages</strong> tab.
                </p>
              </div>
            )}
            {!isBuiltin && (
              <>
                {/* Content Type Selector */}
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Content Type</label>
                  <div className="flex gap-2">
                    {(['html', 'markdown', 'blocks'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { onChange('content_type', t); setEditorMode(t); }}
                        className={`px-3 py-1.5 rounded text-sm border transition ${
                          page.content_type === t
                            ? 'bg-emerald-600/40 border-emerald-500 text-white'
                            : 'border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {t === 'blocks' ? 'Visual Blocks' : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Code Editor */}
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Page Content ({page.content_type})</label>
                  <textarea
                    ref={editorRef}
                    value={currentContent as string}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className={`${glassFieldClass} font-mono text-sm`}
                    style={{ minHeight: '400px', width: '100%' }}
                    spellCheck={false}
                    placeholder={page.content_type === 'html'
                      ? '<div class="p-4"><h1>Welcome</h1><p>Your custom page content here</p></div>'
                      : page.content_type === 'markdown'
                      ? '# Welcome\n\nYour custom page content here'
                      : '[\n  { "type": "heading", "value": "Welcome", "level": 1 },\n  { "type": "text", "value": "Your custom page content here" }\n]'}
                  />
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2">
                  <button type="button" onClick={() => navigator.clipboard.writeText(currentContent as string)} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">
                    Copy Content
                  </button>
                  <button type="button" onClick={() => { const blob = new Blob([currentContent as string], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${page.slug}.${page.content_type}`; a.click(); }} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">
                    Download
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-6">
            {isBuiltin ? (
              <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
                <p className="font-semibold">Actions Not Available</p>
                <p className="mt-1">
                  Built-in pages use the panel's built-in components and do not support custom actions.
                  Custom actions are only available for custom pages you create.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Page Actions</h3>
                  <button type="button" onClick={addAction} className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-500">
                    + Add Action
                  </button>
                </div>
                <p className="text-xs text-gray-500">Define executable actions that can be triggered from this page. Actions run on the edge inside the instance container.</p>

                {actions.map((action, idx) => (
                  <GlassCard key={action.id} className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-white">Action #{idx + 1}</h4>
                      <button type="button" onClick={() => removeAction(action.id)} className="text-red-400 hover:text-red-200 text-sm">Remove</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs text-gray-400">Action Name</span>
                        <input value={action.name} onChange={(e) => updateAction(action.id, { name: e.target.value })} className={glassFieldClass} placeholder="e.g., restart_service" />
                      </label>
                      <label className="block">
                        <span className="text-xs text-gray-400">Type</span>
                        <select value={action.type} onChange={(e) => updateAction(action.id, { type: e.target.value as InstancePageAction['type'] })} className={glassFieldClass}>
                          <option value="shell">Shell Command</option>
                          <option value="read_file">Read File</option>
                          <option value="write_file">Write File</option>
                          <option value="list_files">List Directory</option>
                          <option value="docker">Docker Command</option>
                          <option value="kvm">KVM/Virsh Command</option>
                          <option value="lxd">LXD/LXC Command</option>
                        </select>
                      </label>
                    </div>

                    {action.type === 'shell' && (
                      <label className="block">
                        <span className="text-xs text-gray-400">Command</span>
                        <input value={action.command} onChange={(e) => updateAction(action.id, { command: e.target.value })} className={glassFieldClass + ' font-mono'} placeholder="systemctl restart myservice" />
                      </label>
                    )}

                    {(action.type === 'read_file' || action.type === 'write_file') && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs text-gray-400">File Path</span>
                          <input value={action.path} onChange={(e) => updateAction(action.id, { path: e.target.value })} className={glassFieldClass + ' font-mono'} placeholder="/etc/myapp/config.yaml" />
                        </label>
                        {action.type === 'write_file' && (
                          <label className="block md:col-span-2">
                            <span className="text-xs text-gray-400">Content</span>
                            <textarea value={action.content} onChange={(e) => updateAction(action.id, { content: e.target.value })} rows={5} className={glassFieldClass + ' font-mono w-full'} placeholder="File content to write..." />
                          </label>
                        )}
                      </div>
                    )}

                    {action.type === 'list_files' && (
                      <label className="block">
                        <span className="text-xs text-gray-400">Directory Path</span>
                        <input value={action.path} onChange={(e) => updateAction(action.id, { path: e.target.value })} className={glassFieldClass + ' font-mono'} placeholder="/var/www" />
                      </label>
                    )}

                    {(action.type === 'docker' || action.type === 'kvm' || action.type === 'lxd') && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs text-gray-400">Sub-command</span>
                          <input value={action.command} onChange={(e) => updateAction(action.id, { command: e.target.value })} className={glassFieldClass} placeholder="ps / inspect / logs" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-400">Arguments</span>
                        <input value={action.args} onChange={(e) => updateAction(action.id, { args: e.target.value })} className={glassFieldClass} placeholder="--all --filter name=mycontainer" />
                        </label>
                      </div>
                    )}

                    <label className="block">
                      <span className="text-xs text-gray-400">Environment Variables (JSON)</span>
                      <textarea value={action.env} onChange={(e) => updateAction(action.id, { env: e.target.value })} rows={2} className={glassFieldClass + ' font-mono text-xs'} placeholder='{"KEY": "value"}' />
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <label className="block">
                        <span className="text-xs text-gray-400">Timeout (seconds)</span>
                        <input type="number" min="1" max="300" value={action.timeout} onChange={(e) => updateAction(action.id, { timeout: e.target.value })} className={glassFieldClass} />
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-xs text-gray-400">Description</span>
                      <input value={action.description} onChange={(e) => updateAction(action.id, { description: e.target.value })} className={glassFieldClass} placeholder="What this action does..." />
                    </label>

                    <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => executeAction(action)}
                        disabled={executingAction === action.id}
                        className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-50"
                      >
                        {executingAction === action.id ? 'Executing…' : 'Test Execute'}
                      </button>
                      {actionResult && actionResult.exit_code !== undefined && (
                        <span className={`text-xs font-mono ${actionResult.exit_code === 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          Exit: {actionResult.exit_code}
                        </span>
                      )}
                    </div>

                    {actionResult && (
                      <details className="group">
                        <summary className="text-xs text-gray-400 cursor-pointer select-none">Show Output</summary>
                        <pre className="mt-2 p-3 bg-black/50 border border-white/10 rounded text-xs text-gray-300 overflow-auto max-h-64 font-mono">
                          {actionResult.stdout || '(no stdout)'}
                          {actionResult.stderr && `\n--- STDERR ---\n${actionResult.stderr}`}
                        </pre>
                      </details>
                    )}
                  </GlassCard>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Live Preview</h3>
              <div className="flex gap-2">
                {(['html', 'markdown', 'blocks'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { onChange('content_type', t); setEditorMode(t); }}
                    className={`px-3 py-1.5 rounded text-xs border transition ${
                      page.content_type === t
                        ? 'bg-emerald-600/40 border-emerald-500 text-white'
                        : 'border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {t === 'blocks' ? 'Blocks' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-white/10 rounded-lg overflow-hidden bg-black/30" style={{ minHeight: '500px' }}>
              <iframe
                srcDoc={renderPreview(page.content_type || 'html', currentContent as string)}
                className="w-full h-[600px] border-0"
                title="Page Preview"
              />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {isBuiltin ? (
              <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
                <p className="font-semibold">Settings Not Available</p>
                <p className="mt-1">
                  Built-in pages are managed by the panel and cannot be modified here.
                  To customize a built-in page for a specific template (rename, change icon,
                  enable/disable), use the <strong>Pages</strong> tab in the <strong>Template</strong> editor.
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-white">Page Settings</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs text-gray-400">Name *</span>
                    <input value={page.name} onChange={(e) => onChange('name', e.target.value)} className={glassFieldClass} required />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-400">Slug *</span>
                    <input value={page.slug} onChange={(e) => onChange('slug', e.target.value)} className={glassFieldClass + ' font-mono'} required />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs text-gray-400">Description</span>
                  <textarea value={page.description} onChange={(e) => onChange('description', e.target.value)} rows={2} className={glassFieldClass} />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="text-xs text-gray-400">Kind</span>
                    <select value={page.kind} onChange={(e) => onChange('kind', e.target.value as 'builtin' | 'custom')} className={glassFieldClass}>
                      <option value="custom">Custom</option>
                      <option value="builtin">Built-in</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-400">Category</span>
                    <input value={page.category} onChange={(e) => onChange('category', e.target.value)} className={glassFieldClass} />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs text-gray-400">Icon SVG (inner markup only)</span>
                  <textarea value={page.icon_svg} onChange={(e) => onChange('icon_svg', e.target.value)} rows={3} className={glassFieldClass + ' font-mono text-xs'} placeholder='<path d="M12 2L2 7l10 5 10-5-10-5z" />' />
                </label>
              </>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
};

function renderPreview(contentType: string, content: string): string {
  const safeContent = content || '';
  if (contentType === 'html') {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 1rem; color: #e5e7eb; background: #0f172a; }
* { box-sizing: border-box; }
</style></head><body>${safeContent}</body></html>`;
  }
  if (contentType === 'markdown') {
    // Simple markdown rendering for preview
    let html = safeContent
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 1rem; color: #e5e7eb; background: #0f172a; line-height: 1.6; }
h1,h2,h3 { color: #fff; margin: 1rem 0 0.5rem; }
code { background: #1e293b; padding: 0.1rem 0.3rem; border-radius: 3px; }
pre { background: #1e293b; padding: 1rem; border-radius: 6px; overflow-x: auto; }
</style></head><body>${html}</body></html>`;
  }
  // blocks - render as JSON for now
  let blocksJson = '[]';
  try {
    blocksJson = JSON.stringify(JSON.parse(safeContent || '[]'), null, 2);
  } catch {
    blocksJson = safeContent || '(invalid JSON)';
  }
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: monospace; padding: 1rem; color: #e5e7eb; background: #0f172a; }
pre { background: #1e293b; padding: 1rem; border-radius: 6px; overflow-x: auto; }
</style></head><body><pre>${blocksJson}</pre></body></html>`;
}

export default InstancePageStudio;