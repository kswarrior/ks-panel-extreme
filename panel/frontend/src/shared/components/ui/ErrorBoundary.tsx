import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Reset the boundary when this value changes (e.g. route path). */
  resetKey?: string | number;
  /** Optional label shown in the fallback title. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// ErrorBoundary — catches render crashes in its subtree and renders a
// themed fallback card instead of unmounting the whole app into a blank
// black screen. Without this, any single throwing component (missing
// import, bad page payload, xterm failure…) blanks the entire panel with
// no message and no recovery except a manual reload.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[KS ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}] page crashed:`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private handleRetry = () => this.setState({ error: null });

  render(): React.ReactNode {
    if (this.state.error) {
      const msg = this.state.error.message || 'Unknown error';
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 py-10 text-center animate-fade-in" role="alert">
          <div className="flex flex-col items-center gap-4 max-w-md w-full">
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
            <p className="text-lg font-medium text-gray-300">This page crashed instead of loading.</p>
            <p className="text-sm text-gray-500 font-mono break-all">{msg}</p>
            <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
              <button type="button" onClick={this.handleRetry} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200">
                Try again
              </button>
              <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
