import React from 'react';

export interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onChange }) => (
  <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-white/10 transition-colors duration-200 ${
        checked ? 'bg-emerald-500/80' : 'bg-neutral-800'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 mt-0.5 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
    <span className="flex-1">
      <span className="block text-sm font-medium text-gray-200">{label}</span>
      <span className="block text-xs text-gray-500">{description}</span>
    </span>
  </label>
);

export default ToggleRow;