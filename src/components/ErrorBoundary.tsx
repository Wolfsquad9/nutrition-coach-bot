import { Component, ErrorInfo, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. If omitted, uses the default card. */
  fallback?: ReactNode;
  /** Optional section name for context (e.g. "Plan Generator"). */
  section?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors in its subtree and shows a recovery UI
 * instead of letting the whole app white-screen.
 *
 * Usage:
 *   <ErrorBoundary section="Plans">
 *     <PlansPage />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Centralized error log — wire to Sentry/PostHog here when added.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.section ?? 'unknown', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <Card className="p-6 m-4 border-destructive/50 bg-destructive/5">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-destructive">
            Something went wrong{this.props.section ? ` in ${this.props.section}` : ''}
          </h2>
          <p className="text-sm text-muted-foreground">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleReset}>
              Try again
            </Button>
            <Button variant="ghost" onClick={this.handleReload}>
              Reload page
            </Button>
          </div>
        </div>
      </Card>
    );
  }
}
