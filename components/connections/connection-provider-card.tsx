"use client";

import type { ProviderConnectionView } from "@/lib/connections";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ConnectionProviderCardProps = {
  provider: ProviderConnectionView;
};

function connectionStatusLabel(status: ProviderConnectionView["connectionStatus"]) {
  switch (status) {
    case "connected":
      return ui.connections.statusConnected;
    case "not_connected":
      return ui.connections.statusNotConnected;
    case "needs_reconnect":
      return ui.connections.statusNeedsReconnect;
  }
}

function oauthReadinessLabel(readiness: ProviderConnectionView["oauthReadiness"]) {
  switch (readiness) {
    case "ready":
      return ui.connections.oauthReady;
    case "planned":
      return ui.connections.oauthPlanned;
    case "unavailable":
      return ui.connections.oauthUnavailable;
  }
}

export function ConnectionProviderCard({ provider }: ConnectionProviderCardProps) {
  return (
    <Card padding="lg" className="h-full">
      <div className="space-y-8">
        <div className="flex items-start gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--background-subtle)] text-base font-semibold text-foreground"
            aria-hidden="true"
          >
            {provider.icon}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-title text-foreground">{provider.name}</h2>
              <span className="text-caption font-medium text-foreground">
                {connectionStatusLabel(provider.connectionStatus)}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
              {provider.description}
            </p>
            <p className="text-caption text-[var(--foreground-muted)]">
              {ui.connections.permissionSummary(
                provider.grantedCount,
                provider.missingCount,
              )}
            </p>
          </div>
        </div>

        <div>
          <p className="text-overline">{ui.connections.permissionsLabel}</p>
          <ul className="mt-3 space-y-2">
            {provider.permissions.map((grant) => (
              <li key={grant.id} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    grant.state === "granted"
                      ? "text-[var(--status-success)]"
                      : "text-[var(--foreground-subtle)]"
                  }
                  aria-hidden="true"
                >
                  {grant.state === "granted" ? "✓" : "✕"}
                </span>
                <span
                  className={
                    grant.state === "granted"
                      ? "text-foreground"
                      : "text-[var(--foreground-muted)]"
                  }
                >
                  {grant.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-overline">{ui.connections.servicesLabel}</p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            {provider.services.map((service) => service.name).join(" · ")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
          <div>
            <p className="text-overline">{ui.connections.oauthReadinessLabel}</p>
            <p className="mt-1 text-sm text-foreground">
              {oauthReadinessLabel(provider.oauthReadiness)}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={provider.id !== "google"}
            onClick={() => {
              if (provider.id === "google" && typeof window !== "undefined") {
                window.location.assign(
                  "/api/external-services/google/oauth/authorize",
                );
              }
            }}
          >
            {provider.connectionStatus === "connected" ||
            provider.connectionStatus === "needs_reconnect"
              ? ui.connections.reconnect
              : provider.id === "google"
                ? ui.actions.connect
                : ui.connections.connectFuture}
          </Button>
        </div>
      </div>
    </Card>
  );
}
