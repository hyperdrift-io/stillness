'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type RootErrorBoundaryProps = { children: ReactNode };
type RootErrorBoundaryState = { failed: boolean };

export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Stillness could not render.', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="recovery-message">
          <h1>Stillness can begin again.</h1>
          <p>Refresh this page when you are ready.</p>
        </main>
      );
    }
    return this.props.children;
  }
}
