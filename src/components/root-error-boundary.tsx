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

  private recover = (): void => {
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="recovery-message">
          <h1>Relief can reopen.</h1>
          <p>The local test server lost the current interface module while updating.</p>
          <button className="primary" type="button" onClick={this.recover}>
            Reopen Relief
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
