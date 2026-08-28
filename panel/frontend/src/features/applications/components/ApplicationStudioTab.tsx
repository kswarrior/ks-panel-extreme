import React, { useMemo, useState } from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { appCapabilityMeta } from '@/features/applications/types/application';
import type { ApplicationConfigField } from '@/features/applications/types/application';

const CapDot: React.FC<{ capability: string }> = ({ capability }) => {
  const meta = appCapabilityMeta(capability);
  return <span className={`w-2 h-2 rounded-full ${meta?.dot || 'bg-gray-500'}`} aria-hidden="true" />;
};

interface ApplicationStudioTabProps {
  studioTab: 'general' | 'permission' | 'configure' | 'script';
  setStudioTab: (tab: 'general' | 'permission' | 'configure' | 'script') => void;
  studioForm: {
    general: {
      name: string;
      note: string;
      version: string;
      runtime: string;
      mainFile: string;
      command: string;
    };
    permission: { capability: string; access_level: string; granted: boolean }[];
    configure: Record<string, string>;
    script: { files: { path: string; content: string }[] };
  };
  setStudioForm: React.Dispatch<React.SetStateAction<{
    general: {
      name: string;
      note: string;
      version: string;
      runtime: string;
      mainFile: string;
      command: string;
    };
    permission: { capability: string; access_level: string; granted: boolean }[];
    configure: Record<string, string>;
    script: { files: { path: string; content: string }[] };
  }>>;
}

export default function ApplicationStudioTab({
  studioTab,
  setStudioTab,
  studioForm,
  setStudioForm,
}: ApplicationStudioTabProps) {
  // configure-tab "add env pair" inputs
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');
  // script tab selection
  const [selectedPath, setSelectedPath] = useState('');
  const selectedFile = useMemo(
    () => studioForm.script.files.find((f) => f.path === selectedPath),
    [studioForm.script.files, selectedPath]
  );

  const addScriptFile = () => {
    const input = window.prompt('New file path (relative, e.g. src/bot.js):');
    if (!input) return;
    const path = input.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path) return;
    if (studioForm.script.files.some((f) => f.path === path)) {
      window.alert('A file with this path already exists.');
      return;
    }
    setStudioForm((prev) => ({
      ...prev,
      script: { files: [...prev.script.files, { path, content: '' }] },
    }));
    setSelectedPath(path);
  };

  return (
    <>
      <div className="flex gap-1 mb-3 bg-black/30 border border-white/10 rounded-md p-1">
        {(['general', 'permission', 'configure', 'script'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setStudioTab(t)}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm capitalize ${studioTab === t ? 'ks-tab-active' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      {studioTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-400">Name</span>
            <input
              className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
              placeholder="My Application"
              value={studioForm.general.name}
              onChange={(e) => setStudioForm((prev) => ({ ...prev, general: { ...prev.general, name: e.target.value } }))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400">Version</span>
            <input
              className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
              placeholder="1.0.0"
              value={studioForm.general.version}
              onChange={(e) => setStudioForm((prev) => ({ ...prev, general: { ...prev.general, version: e.target.value } }))}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs text-gray-400">Note</span>
            <textarea
              className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
              rows={2}
              placeholder="Short description…"
              value={studioForm.general.note}
              onChange={(e) => setStudioForm((prev) => ({ ...prev, general: { ...prev.general, note: e.target.value } }))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400">Runtime</span>
            <select
              className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
              value={studioForm.general.runtime}
              onChange={(e) => setStudioForm((prev) => ({ ...prev, general: { ...prev.general, runtime: e.target.value } }))}
            >
              <option value="nodejs">Node.js</option>
              <option value="python">Python</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-400">Main file</span>
            <input
              className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono"
              placeholder="mc/bot.js or app/main.py"
              value={studioForm.general.mainFile}
              onChange={(e) => setStudioForm((prev) => ({ ...prev, general: { ...prev.general, mainFile: e.target.value } }))}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs text-gray-400">Command (Custom runtime only)</span>
            <input
              className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono"
              placeholder="java example.class"
              value={studioForm.general.command}
              onChange={(e) => setStudioForm((prev) => ({ ...prev, general: { ...prev.general, command: e.target.value } }))}
            />
          </label>
        </div>
      )}

      {studioTab === 'configure' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Saved environment defaults for this application. Users can override
            them on the Run form — tokens/keys never need to be hard-coded.
          </p>
          <div className="space-y-2">
            {Object.entries(studioForm.configure).map(([key, value], idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2">
                <input
                  className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                  placeholder="KEY e.g. VERSION"
                  value={key}
                  onChange={(e) => {
                    if (e.target.value === key) return;
                    setStudioForm((prev) => {
                      const newConfigure: Record<string, string> = {};
                      // Rebuild preserving order, renaming `key` in place.
                      for (const [k, v] of Object.entries(prev.configure)) {
                        newConfigure[k === key ? e.target.value : k] = v;
                      }
                      return { ...prev, configure: newConfigure };
                    });
                  }}
                />
                <div className="flex gap-1">
                  <input
                    className="flex-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                    placeholder="Value e.g. 1.0.0"
                    value={value}
                    onChange={(e) => setStudioForm((prev) => ({ ...prev, configure: { ...prev.configure, [key]: e.target.value } }))}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${key}`}
                    onClick={() => setStudioForm((prev) => {
                      const next = { ...prev.configure };
                      delete next[key];
                      return { ...prev, configure: next };
                    })}
                    className="px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                placeholder="KEY e.g. BOT_TOKEN"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
              />
              <input
                className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                placeholder="Value (optional)"
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  const k = newEnvKey.trim();
                  if (!k || k in studioForm.configure) return;
                  setStudioForm((prev) => ({ ...prev, configure: { ...prev.configure, [k]: newEnvValue } }));
                  setNewEnvKey('');
                  setNewEnvValue('');
                }}
                disabled={!newEnvKey.trim()}
                className="px-3 py-1.5 text-sm rounded border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
          <GlassCard className="text-xs text-gray-300">
            These become the application's saved env — every Run merges them under the operator's per-run overrides.
          </GlassCard>
        </div>
      )}

      {studioTab === 'script' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="ks-card ks-form-card md:col-span-1 rounded-md overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 uppercase">Files</p>
              <div className="flex gap-1">
                <label className="ks-btn-ghost text-[10px] px-2 py-0.5 cursor-pointer">
                  Upload
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files || []);
                      if (!picked.length) return;
                      setStudioForm((prev) => ({
                        ...prev,
                        script: {
                          files: [
                            ...prev.script.files,
                            ...picked.map((f) => ({ path: f.name.replace(/\\/g, '/'), content: '' })),
                          ],
                        },
                      }));
                      // Read asynchronously and patch content in place.
                      picked.forEach((f) => {
                        f.text().then((txt) => {
                          setStudioForm((prev) => ({
                            ...prev,
                            script: {
                              files: prev.script.files.map((x) =>
                                x.path === f.name.replace(/\\/g, '/') && x.content === '' ? { ...x, content: txt } : x
                              ),
                            },
                          }));
                        }).catch(() => { /* leave empty content; editable */ });
                      });
                      e.target.value = '';
                    }}
                  />
                </label>
                <button type="button" className="ks-btn-ghost text-[10px] px-2 py-0.5" onClick={addScriptFile}>New</button>
              </div>
            </div>
            <ul className="text-sm space-y-1">
              {studioForm.script.files.map((file, idx) => (
                <li key={idx} className={`flex items-center justify-between px-2 py-1 rounded ${selectedPath === file.path ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                  <button
                    type="button"
                    className="truncate text-left flex-1"
                    onClick={() => setSelectedPath(file.path)}
                    title={file.path}
                  >
                    {file.path}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${file.path}`}
                    onClick={() =>
                      setStudioForm((prev) => ({
                        ...prev,
                        script: { files: prev.script.files.filter((f) => f.path !== file.path) },
                      }))
                    }
                    className="ml-2 shrink-0 text-red-400 hover:text-red-300 px-1 rounded hover:bg-red-900/30"
                  >
                    ×
                  </button>
                </li>
              ))}
              {studioForm.script.files.length === 0 && (
                <li className="text-xs text-gray-500 px-2">No files yet.</li>
              )}
            </ul>
          </div>
          <div className="ks-card ks-form-card md:col-span-2 rounded-md flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 uppercase">Editor{selectedPath ? ` — ${selectedPath}` : ''}</p>
            </div>
            <textarea
              className="w-full flex-1 min-h-[50vh] bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-2 font-mono"
              placeholder="# Select a file to edit…"
              value={selectedFile?.content ?? ''}
              readOnly={!selectedFile}
              onChange={(e) => {
                if (!selectedPath) return;
                const content = e.target.value;
                setStudioForm((prev) => ({
                  ...prev,
                  script: {
                    files: prev.script.files.map((f) => (f.path === selectedPath ? { ...f, content } : f)),
                  },
                }));
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}