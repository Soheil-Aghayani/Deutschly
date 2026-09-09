import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Deutschly failed to render", error, info);
  }

  private handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-crash-fallback" lang="en">
        <div className="app-crash-fallback__card">
          <div className="app-crash-fallback__icon" aria-hidden="true">📚</div>
          <p className="eyebrow">One moment...</p>
          <h1>Deutschly needs a refresh</h1>
          <p>Something interrupted the study space. Reload once and your locally saved cards should still be there.</p>
          <button type="button" className="primary-button" onClick={this.handleRetry}>
            Reload Deutschly
          </button>
        </div>
      </main>
    );
  }
}
