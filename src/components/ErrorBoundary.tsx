import { Component, ErrorInfo, type ReactNode } from 'react';

interface EBProps { children: ReactNode; fallback?: ReactNode; }

export class ErrorBoundary extends Component<EBProps> {
  state: any = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleRetry = () => (this as any).setState({ hasError: false, error: null });

  render() {
    const s = (this as any).state;
    const p = (this as any).props;
    if (s.hasError) {
      if (p.fallback) return p.fallback;
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-2xl">!</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-6">An unexpected error occurred. Please try refreshing.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={this.handleRetry} className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-semibold hover:bg-lime-700">Try again</button>
              <button onClick={() => window.location.reload()} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200">Reload page</button>
            </div>
          </div>
        </div>
      );
    }
    return p.children;
  }
}
