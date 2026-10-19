"use client";

import { Component, type ReactNode } from "react";

/**
 * Wraps each Tonight and "Your clubs" surface (Oct 19, 2026). The app has no
 * error boundary of its own, so a render crash inside a side panel would take
 * the whole feed or Events tab down with it. Here the panel just goes away:
 * it renders nothing and logs once, and everything around it keeps working.
 */
export class QuietBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[tonight]", this.props.name, "hid after a render error", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
