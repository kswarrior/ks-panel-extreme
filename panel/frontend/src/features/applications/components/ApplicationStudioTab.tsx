import React from 'react';
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
            Define environment variables. Use <code className="text-gray-300">${'{'}</code>VERSION{'}'} in scripts for replacement at activation.
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
                      const newConfigure = { ...prev.configure };
                      delete newConfigure[key];
                      newConfigure[e.target.value] = value;
                      return { ...prev, configure: newConfigure };
                    });
                  }}
                />
                <input
                  className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                  placeholder="Value e.g. 1.0.0"
                  value={value}
                  onChange={(e) => setStudioForm((prev) => ({ ...prev, configure: { ...prev.configure, [key]: e.target.value } }))}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <input
                className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                placeholder="KEY e.g. VERSION"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                    setStudioForm((prev) => ({ ...prev, configure: { ...prev.configure, [(e.target as HTMLInputElement).value]: '' } }));
                  }
                }}
              />
              <input
                className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                placeholder="Value e.g. 1.0.0"
              />
            </div>
          </div>
          <GlassCard className="text-xs text-gray-300">
            Example: <code>VERSION=1.2.3</code> → script can use <code>${'{VERSION}'}</code>
          </GlassCard>
        </div>
      )}

      {studioTab === 'script' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1 border border-white/10 rounded-md bg-black/20 p-2 max-h-[60vh] overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 uppercase">Files</p>
              <div className="flex gap-1">
                <button className="ks-btn-ghost text-[10px] px-2 py-0.5">Upload</button>
                <button className="ks-btn-ghost text-[10px] px-2 py-0.5">New</button>
              </div>
            </div>
            <ul className="text-sm space-y-1">
              {studioForm.script.files.map((file, idx) => (
                <li key={idx} className="flex items-center justify-between hover:bg-white/5 px-2 py-1 rounded">
                  <span>{file.path}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-2 border border-white/10 rounded-md bg-black/20 p-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 uppercase">Editor</p>
              <button className="ks-btn-ghost text-[10px] px-2 py-0.5">Unzip</button>
            </div>
            <textarea className="w-full h-[60vh] bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-2 font-mono" placeholder="# Select a file to edit…" />
          </div>
        </div>
      )}
    </>
  );
}