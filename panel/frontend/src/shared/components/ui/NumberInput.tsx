import React from 'react';

export interface NumberInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

const NumberInput: React.FC<NumberInputProps> = ({ id, label, value, onChange, min, max }) => (
  <div>
    <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step={1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
    />
  </div>
);

export default NumberInput;