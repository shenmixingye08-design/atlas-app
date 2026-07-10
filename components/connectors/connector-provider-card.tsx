"use client";

import type { ConnectorProviderView, ConnectorServiceStatus } from "@/lib/connectors";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

type ConnectorProviderCardProps = {
  provider: ConnectorProviderView;
};

function statusLabel(status: ConnectorServiceStatus | ConnectorProviderView["status"]) {
  switch (status) {
    case "connected":
      return ui.connectors.statusConnected;
    case "available":
      return ui.connectors.statusAvailable;
    case "coming_soon":
      return ui.connectors.statusComingSoon;
  }
}

function statusClass(status: ConnectorServiceStatus | ConnectorProviderView["status"]) {
  switch (status) {
    case "connected":
      return "text-[var(--status-success)]";
    case "available":
      return "text-foreground";
    case "coming_soon":
      return "text-[var(--foreground-subtle)]";
  }
}

export function ConnectorProviderCard({ provider }: ConnectorProviderCardProps) {
  return (
    <Card padding="lg" className="h-full">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--background-subtle)] text-sm font-semibold text-foreground"
            aria-hidden="true"
          >
            {provider.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-title text-foreground">{provider.name}</h2>
              <span className={`text-caption font-medium ${statusClass(provider.status)}`}>
                {statusLabel(provider.status)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              {provider.description}
            </p>
          </div>
        </div>

        <div>
          <p className="text-overline">{ui.connectors.servicesLabel}</p>
          <ul className="mt-3 space-y-3">
            {provider.services.map((service) => (
              <li
                key={service.id}
                className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{service.name}</p>
                  <p className="mt-1 text-caption text-[var(--foreground-muted)]">
                    {service.description}
                  </p>
                </div>
                <span className={`shrink-0 text-caption ${statusClass(service.status)}`}>
                  {statusLabel(service.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-overline">{ui.connectors.permissionsLabel}</p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            {provider.permissions.join(" · ")}
          </p>
        </div>
      </div>
    </Card>
  );
}
