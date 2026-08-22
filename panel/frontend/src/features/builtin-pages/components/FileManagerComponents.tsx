// Files UI components - extracted from Files.tsx

import React, { useRef, useState, useEffect } from 'react';
import GlassModal from '@/shared/components/ui/Modal';
import type { CodeEditorProps, HLMode, HLToken, RowAction, FileEntry, FileType } from '../types/files';
import { highlightLine } from '../utils/syntaxHighlighter';
import { iconColorFor } from '../utils/syntaxHighlighter';
import { FileIcon } from './FileIcons';

export const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, mode, readOnly = false, onSave }) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrap, setWrap] = useState(false);

  const lines = value.split('\n');
  const lineDigits = Math.max(2, String(lines.length).length);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      onSave?.();
      return;
    }
    if (e.key === 'Tab' && !readOnly) {
      e.preventDefault();
      const ta = e.currentTarget;
      const s = ta.selectionStart, en = ta.selectionEnd;
      const indent = '  ';
      const next = value.slice(0, s) + indent + value.slice(en);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + indent.length;
      });
    }
  };

  const onScroll = () => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  };

  return (
    <div className="rounded-lg overflow-hidden border border-white/10 bg-[#1e1e1e]">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#252526] border-b border-black/40 text-[11px] text-gray-300">
        <div className="flex items-center gap-3">
          <span className="font-mono uppercase tracking-wide text-gray-400">{mode}</span>
          <button
            type="button"
            onClick={() => setShowLineNumbers((v) => !v)}
            className={`px-1.5 py-0.5 rounded ${showLineNumbers ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            title="Toggle line numbers"
          >
            #
          </button>
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            className={`px-1.5 py-0.5 rounded ${wrap ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            title="Toggle word wrap"
          >
            ⤶
          </button>
          {readOnly && <span className="text-amber-300/80">read-only</span>}
        </div>
        <div className="flex items-center gap-2">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              className="px-2 py-0.5 rounded bg-sky-600/70 hover:bg-sky-500 text-white text-[11px]"
              title="Save (Ctrl/Cmd+S)"
            >
              Save
            </button>
          )}
        </div>
      </div>

      <div className="relative font-mono text-[13px] leading-[1.45] h-[60vh] overflow-hidden">
        <pre
          ref={preRef}
          aria-hidden
          className={`hl-pre absolute inset-0 m-0 p-2 ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} overflow-auto text-gray-200 pointer-events-none`}
          style={{ tabSize: 2 }}
        >
          {lines.map((ln, i) => (
            <div key={i} className="hl-line">
              {showLineNumbers && (
                <span className="hl-lineno" style={{ minWidth: `${lineDigits + 0.5}ch` }}>{i + 1}</span>
              )}
              <span className="hl-content">
                {ln.length === 0 ? '\u00a0' : highlightLine(ln, mode).map((t, j) => (
                  <span key={j} className={t.cls}>{t.text}</span>
                ))}
              </span>
            </div>
          ))}
        </pre>
        <textarea
          ref={taRef}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={`absolute inset-0 m-0 p-2 bg-transparent text-transparent caret-white ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} overflow-auto outline-none resize-none`}
          style={{ tabSize: 2, caretColor: 'white' }}
        />
      </div>
    </div>
  );
};

export const RowMenu: React.FC<{ actions: RowAction[] }> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        title="More actions"
        aria-label="More actions"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /> </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-white/10 bg-[#1e1e1e] shadow-xl py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick(e); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-white/10 ${a.danger ? 'text-red-300' : 'text-gray-200'}`}
            >
              {a.icon && <span className="shrink-0">{a.icon}</span>}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const PromptModal: React.FC<{
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  onConfirm: (v: string) => Promise<void> | void;
  onClose: () => void;
}> = ({ open, title, label, placeholder, initial = '', confirmLabel = 'Create', onConfirm, onClose }) => {
  const [val, setVal] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setVal(initial); setErr(''); setBusy(false); } }, [open, initial]);
  const submit = async () => {
    if (!val.trim()) { setErr('Name is required'); return; }
    setBusy(true); setErr('');
    try { await onConfirm(val.trim()); } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };
  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className="text-xs border border-white/10 text-gray-200 px-3 py-1.5 rounded hover:bg-white/10">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="text-xs bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-500 disabled:opacity-50">{busy ? '…' : confirmLabel}</button>
        </>
      }
    >
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        autoFocus
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
        placeholder={placeholder}
        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono outline-none focus:border-sky-500"
      />
      {err && <p className="text-xs text-red-300 mt-2">{err}</p>}
    </GlassModal>
  );
};

export const ProgressCircle: React.FC<{ pct: number; size?: number }> = ({ pct, size = 56 }) => {
  if (pct <= 0) return null;
  const clamped = Math.min(100, Math.max(0, pct));
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const display = `${Math.round(clamped)}%`;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0" aria-label={`Upload progress {display}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 200ms ease' }}
        />
      </svg>
      <span className="relative text-[11px] font-semibold text-sky-300">{display}</span>
    </div>
  );
};