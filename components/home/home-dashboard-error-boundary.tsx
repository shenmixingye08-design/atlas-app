"use client";

import { Component, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";

type HomeDashboardErrorBoundaryProps = {
  children: ReactNode;
};

type HomeDashboardErrorBoundaryState = {
  hasError: boolean;
};

export function HomeWorkLoadError({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-2xl)] border border-amber-500/25 bg-amber-500/5 px-6 py-10 text-center"
    >
      <p className="text-base font-medium text-foreground">{ui.home.loadError}</p>
      <p className="mt-2 text-sm text-[var(--foreground-muted)]">
        {ui.home.loadErrorHint}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {ui.home.loadErrorRetry}
          </Button>
        </div>
      )}
    </div>
  );
}

export class HomeDashboardErrorBoundary extends Component<
  HomeDashboardErrorBoundaryProps,
  HomeDashboardErrorBoundaryState
> {
  state: HomeDashboardErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): HomeDashboardErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error("[HomeDashboard]", error);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return <HomeWorkLoadError onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}
