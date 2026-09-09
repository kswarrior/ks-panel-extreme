import React from 'react';

// ErrorState — single shared full-page error / not-found surface.
//
// Unifies every detail page ("Instance not found", "Stack not found", …)
// on the Instance pages' centered pattern: big SVG on top, title below it,
// optional description, then Back / Retry buttons centered (aligned to the
// text, not left-aligned). Two variants:
//   not-found → overlapping-windows SVG (same artwork as InstanceDetail)
//   error     → alert-triangle SVG for load failures / crash fallbacks
interface ErrorStateProps {
  variant?: 'not-found' | 'error';
  title: string;
  description?: string;
  backLabel?: string;
  onBack?: () => void;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

const NotFoundArt: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-20 h-20 text-gray-400"
    aria-hidden="true"
  >
    <rect x="3" y="6" width="11" height="9" rx="1.2" />
    <path d="M3 10h11" opacity="0.5" />
    <circle cx="5.5" cy="8" r="0.7" fill="currentColor" />
    <circle cx="7.5" cy="8" r="0.7" fill="currentColor" opacity="0.5" />
    <rect x="8" y="11" width="11" height="9" rx="1.2" />
    <path d="M8 15h11" opacity="0.5" />
    <circle cx="10.5" cy="13" r="0.7" fill="currentColor" />
    <circle cx="12.5" cy="13" r="0.7" fill="currentColor" opacity="0.5" />
  </svg>
);

const ErrorArt: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-20 h-20 text-red-400/80"
    aria-hidden="true"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ErrorState: React.FC<ErrorStateProps> = ({
  variant = 'not-found',
  title,
  description,
  backLabel,
  onBack,
  retryLabel,
  onRetry,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center min-h-[40vh] px-4 py-10 text-center animate-fade-in ${className}`}>
    <div className="flex flex-col items-center gap-4 max-w-md w-full">
      {variant === 'error' ? <ErrorArt /> : <NotFoundArt />}
      <p className="text-lg font-medium text-gray-300">{title}</p>
      {description ? (
        <p className="text-sm text-gray-500 break-words">{description}</p>
      ) : null}
      {onBack || onRetry ? (
        <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200"
            >
              {retryLabel || 'Retry'}
            </button>
          ) : null}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300"
            >
              {backLabel || 'Back'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  </div>
);

export default ErrorState;
