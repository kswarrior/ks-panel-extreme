import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '@/shared/stores/confirmStore';
import { downloadFile, readFileText, statPath, writeFile } from '../api/instanceFiles';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

// MAX_EDIT_BYTES keeps huge binaries out of the textarea (2 MiB of text is
// already unwieldy); larger files get download-only treatment.
const MAX_EDIT_BYTES = 2 * 1024 * 1024;

const InstanceFileEditor: React.FC<{ instanceId: number; filesSlug: string }> = ({ instanceId, filesSlug }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const targetPath = searchParams.get('path') || '';

  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tooLarge, setTooLarge] = useState(false);

  const dirty = text !== savedText;
  const backTo = `/instances/${instanceId}/${filesSlug}`;

  const load = useCallback(async () => {
    if (!targetPath) {
      setError('No file path given — open a file from the Files page.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setTooLarge(false);
    try {
      // Size gate before pulling bytes so multi-hundred-MB binaries never
      // land in the textarea (stat failures fall through to a direct read).
      try {
        const st = await statPath(instanceId, targetPath);
        if (!st.is_dir && st.size > MAX_EDIT_BYTES) {
          setTooLarge(true);
          setLoading(false);
          return;
        }
      } catch {
        /* stat is best-effort; the read below reports real failures */
      }
      const body = await readFileText(instanceId, targetPath);
      setText(body);
      setSavedText(body);
    } catch (e: any) {
      setError(e?.message || 'Read failed');
    } finally {
      setLoading(false);
    }
  }, [instanceId, targetPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!targetPath || saving) return;
    setSaving(true);
    try {
      await writeFile(instanceId, targetPath, text);
      setSavedText(text);
      toast(`Saved ${targetPath}`, 'success');
    } catch (e: any) {
      toast(e?.message || 'Write failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [instanceId, targetPath, text, saving]);

  const goBack = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes',
        message: `Discard unsaved changes to "${targetPath}"?`,
        tone: 'danger',
        confirmLabel: 'Discard',
      });
      if (!ok) return;
    }
    navigate(backTo);
  }, [dirty, confirm, targetPath, navigate, backTo]);

  const reload = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Reload from disk',
        message: 'Reload from disk and discard your unsaved changes?',
        tone: 'danger',
        confirmLabel: 'Reload',
      });
      if (!ok) return;
    }
    void load();
  }, [dirty, confirm, load]);

  return (
    <div className="flex flex-col gap-3 animate-fade-in" style={{ minHeight: 420 }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-white m-0">Editor</h2>
          <p className="ks-mono text-[11px] text-gray-500 mt-0.5 break-all" title={targetPath}>
            {targetPath || '(no ?path= given)'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => void goBack()} title="Back to the Files page" className="ks-btn">
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
              Files
            </span>
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading || saving}
            title="Re-read the file from disk"
            aria-label="Reload"
            className="ks-btn-header ks-icon-btn disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !dirty || !targetPath}
            title="Write the file (Ctrl+S)"
            className="ks-btn-primary ks-btn disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-6 animate-pulse">
          <div className="h-4 w-2/3 bg-neutral-800 rounded mb-2" />
          <div className="h-4 w-1/2 bg-neutral-800 rounded" />
        </div>
      ) : error ? (
        <div className="ks-card text-sm" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)' }}>
          {error}
        </div>
      ) : tooLarge ? (
        <div className="ks-card text-center space-y-2">
          <p className="text-sm text-gray-200">This file is too large to edit in the browser.</p>
          <button
            type="button"
            onClick={() => {
              downloadFile(instanceId, targetPath)
                .then(() => toast('Downloading', 'success'))
                .catch((e: any) => toast(e?.message || 'Download failed', 'error'));
            }}
            className="ks-btn"
          >
            Download instead
          </button>
        </div>
      ) : (
        <div className="ks-card !p-2.5 flex-1 flex flex-col" style={{ marginBottom: 0 }}>
          <textarea
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                void save();
              }
            }}
            aria-label="File contents"
            className="ks-input ks-mono flex-1 w-full"
            style={{ minHeight: 300, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>
      )}

      <p className="text-[11px] text-gray-500 m-0">
        {dirty ? 'Unsaved changes' : error || tooLarge ? '' : `Ready · ${text.length} bytes`}
      </p>
    </div>
  );
};

export default InstanceFileEditor;
