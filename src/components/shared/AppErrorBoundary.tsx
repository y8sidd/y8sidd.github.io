import { Component, type ReactNode } from "react";

/** Covers rejected lazy imports as well as render failures outside the canvas. */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="pending-page" role="alert">
        <h1>The preview couldn’t load.</h1>
        <p>Check that the local server is running, then reload to try again.</p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          Reload preview
        </button>
        <a className="text-button" href="/">
          Return to the landing page
        </a>
      </main>
    );
  }
}
