import React from 'react';

export interface TextInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  name?: string;
  autoComplete?: string;
}

const TextInput: React.FC<TextInputProps> = ({ id, label, value, onChange, placeholder, type = 'text', required = false, disabled = false, error, name, autoComplete }) => (
  <div>
    <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor={id}>
      {label}
      {required && <span aria-hidden="true" className="ml-1 text-red-400">*</span>}
    </label>
    <input
      id={id}
      name={name ?? id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoComplete={autoComplete}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`ks-input w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${error ? 'ks-input-error border-red-500/50' : ''}`}
    />
    {error && (
      <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-400 break-words">
        {error}
      </p>
    )}
  </div>
);

export default TextInput;