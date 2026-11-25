import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last line of defence: a render error shows a message with a reload button instead of a blank page. The autosaved drawing is untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ margin: '12vh auto', maxWidth: 520, padding: 24, border: '1px solid #e2e8f0', borderRadius: 12, font: '15px/1.6 Inter, sans-serif' }}>
        <h2 style={{ margin: '0 0 8px' }}>Something went wrong</h2>
        <p style={{ margin: '0 0 14px' }}>The page hit an unexpected error. Your drawing is saved automatically, so reloading should bring it back.</p>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 13 }}>{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} style={{ marginRight: 8 }}>Try again</button>
        <button onClick={() => location.reload()}>Reload page</button>
      </div>
    );
  }
}
