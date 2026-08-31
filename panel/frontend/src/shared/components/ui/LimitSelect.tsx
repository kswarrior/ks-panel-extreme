import React, { useState } from 'react';

interface Props {
  value: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
}

const PRESETS = [25, 50, 75, 100, 125];

const LimitSelect: React.FC<Props> = ({ value, onChange, ariaLabel = 'Page size' }) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState('');

  const handleSelect = (raw: string) => {
    if (raw === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(Number(raw));
  };

  const commitCustom = () => {
    const n = Number(customVal);
    if (Number.isFinite(n) && n > 0) {
      onChange(Math.floor(n));
      setCustomOpen(false);
    }
  };

  const isPreset = PRESETS.includes(value);

  return (
    <div className="inline-flex items-center gap-1">
      <select
        value={isPreset ? String(value) : 'custom'}
        onChange={(e) => handleSelect(e.target.value)}
        aria-label={ariaLabel}
        className="bg-black/30 border border-white/10 rounded-md text-xs text-gray-200 px-2 py-1.5 focus:outline-none focus:border-white/40"
      >
        {PRESETS.map((n) => (
          <option key={n} value={String(n)}>
            {n} / page
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {customOpen && (
        <div className="inline-flex items-center gap-1">
          <input
            type="number"
            min={1}
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCustom();
              if (e.key === 'Escape') setCustomOpen(false);
            }}
            placeholder="N"
            aria-label="Custom page size"
            className="w-20 bg-black/30 border border-white/10 rounded-md text-xs text-white placeholder-gray-500 px-2 py-1.5 focus:outline-none focus:border-white/40"
            autoFocus
          />
          <button
            type="button"
            onClick={commitCustom}
            className="px-2 py-1.5 rounded-md text-xs bg-white/10 border border-white/20 text-white hover:bg-white/20"
          >
            OK
          </button>
        </div>
      )}
      {!isPreset && !customOpen && (
        <span className="text-[10px] text-gray-400">({value})</span>
      )}
    </div>
  );
};

export default LimitSelect;
