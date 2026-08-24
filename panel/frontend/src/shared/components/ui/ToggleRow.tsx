import React from 'react';

export interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onChange }) => (
  <label htmlFor={id} className="flex items-start justify-between gap-3 cursor-pointer select-none">
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-medium text-gray-200">{label}</span>
      <span className="block text-xs text-gray-500">{description}</span>
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className={`ks-toggle shrink-0 ${checked ? 'is-on' : ''}`}
    >
      <span
        className={`ks-toggle__thumb ${
          checked ? 'translate-x-full' : ''
        }`}
      />
    </button>
  </label>
);

export default ToggleRow;