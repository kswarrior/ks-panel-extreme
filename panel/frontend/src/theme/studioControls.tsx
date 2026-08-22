import React from 'react';

// Small reusable control bricks for the Theme Studio. Keeping them in one
// file keeps the studio page readable; each control stays presentational
// and pushes the new value up via onChange.

export const Label: React.FC<{ label: string; hint?: string; htmlFor?: string }> = ({
  label, hint, htmlFor,
}) => (
  <div className="mb-1.5">
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-200">{label}</label>
    {hint && <p className="text-xs text-gray-500">{hint}</p>}
  </div>
);

const inputCls =
  'w-full bg-black/30 backdrop-blur-md text-white placeholder-gray-500 ' +
  'border border-white/10 rounded-md px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 ' +
  'transition-colors duration-150';

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}
export const Slider: React.FC<SliderProps> = ({ label, value, min = 0, max, step = 1, suffix = 'px', onChange }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium text-gray-200">{label}</span>
      <span className="text-xs text-gray-400 tabular-nums">{value}{suffix}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-white"
    />
  </div>
);

interface TextProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  hint?: string;
  mono?: boolean;
}
export const Text: React.FC<TextProps> = ({ label, value, placeholder, onChange, hint, mono }) => (
  <div>
    <Label label={label} hint={hint} />
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} ${mono ? 'font-mono text-xs' : ''}`}
    />
  </div>
);

// CodeArea is the multi-line CSS editor used by the Theme Studio's
// "Custom CSS" tab. It mirrors `Text` but uses a <textarea> so the admin
// can write multi-line CSS (selectors, media queries, nested rules). The
// field is mono-spaced, has spell-check off (CSS keywords mustn't get
// auto-corrected), and is vertically resizable so long blocks stay
// comfortable to edit. spellCheck={false} also stops the browser from
// underlining every selector in red.
interface CodeAreaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
}
export const CodeArea: React.FC<CodeAreaProps> = ({ label, value, onChange, placeholder, hint, rows = 8 }) => (
  <div>
    <Label label={label} hint={hint} />
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} font-mono text-xs leading-relaxed resize-y min-h-[6rem]`}
    />
  </div>
);

interface ColorProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
// ColorField blends a native color picker with a hex text input. The native
// picker is the friendliest UX for solid colours; the text field covers the
// case where the value is a CSS rgba()/hsl() expression (which the picker
// can't represent). We fall back to showing the raw value in the text box
// whenever it isn't a clean hex.
export const ColorField: React.FC<ColorProps> = ({ label, value, onChange }) => {
  const isHex = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8}|[0-9a-fA-F]{3})$/.test(value);
  return (
    <div>
      <Label label={label} />
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <input
            type="color"
            value={isHex && value.length === 7 ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="w-9 h-9 rounded-md border border-white/10 bg-transparent cursor-pointer p-0"
            aria-label={`${label} color picker`}
          />
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000 or rgba(...)"
          className={`${inputCls} font-mono text-xs flex-1`}
        />
      </div>
    </div>
  );
};

interface SelectProps {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (v: string) => void;
}
export const Select: React.FC<SelectProps> = ({ label, value, options, onChange }) => (
  <div>
    <Label label={label} />
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

interface ColorSwatchProps {
  label: string;
  value: string;
  presets: string[];
  onChange: (v: string) => void;
}
// Swatches are the one-click grid shown for "Black / Dark blue / etc."
// presets in the background section. Picking one writes the hex into the
// theme just like typing it would.
export const ColorSwatches: React.FC<ColorSwatchProps> = ({ label, value, presets, onChange }) => (
  <div>
    <Label label={label} hint="Click a preset, or type a custom hex below." />
    <div className="grid grid-cols-4 gap-2 mb-2">
      {presets.map((p) => {
        const active = value.toLowerCase() === p.toLowerCase();
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            title={p}
            className={`h-10 rounded-md border transition ${active ? 'ring-2 ring-white border-white' : 'border-white/10 hover:border-white/40'}`}
            style={{ background: p }}
          />
        );
      })}
    </div>
    <ColorField label="Custom color" value={value} onChange={onChange} />
  </div>
);

// MediaField is the shared control for image/video background sources: it
// exposes both an "upload from disk" tab (png/jpg/gif/mp4 supported) and a
// "paste a URL" tab. Uploading uses a local object URL so no network
// upload is required — the file is referenced directly by the browser so
// the theme stays self-contained and preview flips instantly.
interface MediaFieldProps {
  label: string;
  value: string;
  accept: string;          // mime filter for the file picker
  onChange: (v: string) => void;
}
export const MediaField: React.FC<MediaFieldProps> = ({ label, value, accept, onChange }) => {
  const [tab, setTab] = React.useState<'url' | 'upload'>(value && !value.startsWith('blob:') ? 'url' : 'upload');
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [err, setErr] = React.useState('');

const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!f) return;
    const okTypes = accept.split(',').map((s) => s.trim());
    if (okTypes.length && !okTypes.some((t) => t === '*' || f.type === t || (t.endsWith('/*') && f.type.startsWith(t.slice(0, -1))))) {
      setErr(`Unsupported file type "${f.type || 'unknown'}". Allowed: ${accept}`);
      return;
    }
    setErr('');
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      onChange(dataUrl);
      setTab('upload');
    };
    reader.onerror = () => {
      setErr('Failed to read file');
    };
    reader.readAsDataURL(f);
  };

  return (
    <div>
      <Label label={label} hint="Use a remote URL or upload a file from your device." />
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => setTab('url')}
          className={`px-3 py-1 rounded text-xs ${tab === 'url' ? 'bg-white/10 text-white border border-white/20' : 'text-gray-400 border border-transparent hover:text-white'}`}
        >
          URL
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={`px-3 py-1 rounded text-xs ${tab === 'upload' ? 'bg-white/10 text-white border border-white/20' : 'text-gray-400 border border-transparent hover:text-white'}`}
        >
          Upload
        </button>
      </div>

      {tab === 'url' && (
        <input
          value={value && !value.startsWith('blob:') ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/image.jpg"
          className={`${inputCls} font-mono text-xs`}
        />
      )}

      {tab === 'upload' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-3 py-1.5 rounded hover:bg-gray-200 text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
            Choose file
          </button>
          <span className="text-xs text-gray-500">{accept}</span>
          <input ref={fileRef} type="file" accept={accept} onChange={onFile} className="hidden" />
        </div>
      )}

      {value && (
        <p className="text-xs text-gray-500 mt-2 font-mono truncate" title={value}>
          current: {value.slice(0, 64)}{value.length > 64 ? '…' : ''}
        </p>
      )}
      {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
    </div>
  );
};
