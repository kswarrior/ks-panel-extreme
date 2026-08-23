import React from 'react';

// Field wraps a labelled input in the panel-wide styling so each
// create/edit page reads the same without us pasting 6 Tailwind classes
// 40 times. Drop the standard `input`, `select`, or `textarea` as the
// only child and Field forwards the matched className through cloneElement.
interface FieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactElement;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
}

const fieldClass =
  // ks-input hooks the control into the Theme Studio's Forms section so
  // every GlassField-rendered input/select/textarea follows the admin's
  // theme; the Tailwind utilities stay as the stock fallback.
  'ks-input w-full bg-black/30 backdrop-blur-md text-white placeholder-gray-500 ' +
  'border border-white/10 rounded-md px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 ' +
  'transition-colors duration-150';

const Field: React.FC<FieldProps> = ({
  label,
  hint,
  htmlFor,
  children,
  className = '',
  inputClassName = '',
  labelClassName = '',
}) => {
  // Inject the field styling into the single child control. cloneElement
  // is fine here because the only consumers are real <input>/<select>/
  // <textarea> elements; polymorphic input components aren't part of this
  // surface.
  const child = React.cloneElement(children as React.ReactElement<any>, {
    className: `${fieldClass} ${inputClassName}`,
  });
  return (
    <div className={`${className} ks-field`}>
      <label htmlFor={htmlFor} className={`ks-label ${labelClassName}`}>
        {label}
      </label>
      {hint && <p className="ks-hint">{hint}</p>}
      {child}
    </div>
  );
};

// Export the raw class string so pages that mix multiple controls (e.g.
// a `select` next to a checkbox) can pull the same look without going
// through GlassField.
export { fieldClass as glassFieldClass };

export default Field;
