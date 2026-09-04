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
        <div className="glass-card rounded-xl p-6 text-center space-y-3" role="alert">
          <p className="text-sm font-semibold text-red-300">This page crashed instead of loading.</p>
          <p className="text-xs text-gray-400 font-mono break-all">{msg}</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button type="button" onClick={this.handleRetry} className="ks-btn text-xs">
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} className="ks-btn text-xs">
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
