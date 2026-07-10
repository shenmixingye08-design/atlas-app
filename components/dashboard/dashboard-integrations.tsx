import Link from "next/link";

import type { IntegrationCatalog } from "@/lib/integrations/types";
import { formatIntegrationTimestamp } from "@/lib/integrations/client";
import { ui } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

const HIGHLIGHT_PROVIDERS = [
  "google_drive",
  "wordpress",
  "slack",
  "gmail",
] as const;

type DashboardIntegrationsProps = {
  catalog: IntegrationCatalog | null;
};

export function DashboardIntegrations({ catalog }: DashboardIntegrationsProps) {
  if (!catalog) return null;

  const highlighted = HIGHLIGHT_PROVIDERS.map((id) =>
    catalog.providers.find((p) => p.id === id),
  ).filter((p): p is NonNullable<typeof p> => p !== undefined);

  return (
    <section aria-labelledby="integrations-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="integrations-heading" className="text-title text-foreground">
            {ui.integrations.title}
          </h2>
          <p className="mt-1 text-caption">{ui.integrations.connectedServices}</p>
        </div>
        <Link href="/integrations">
          <Button variant="ghost" size="sm" className="ring-1 ring-[var(--border)]">
            {ui.actions.manage}
          </Button>
        </Link>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {highlighted.map((provider) => {
          const connected = provider.connection?.connected ?? false;

          return (
            <Card key={provider.id} variant="default" padding="md">
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] bg-white/[0.04] text-lg ring-1 ring-[var(--border)]">
                  {provider.icon}
                </div>
                <StatusChip
                  status={connected ? "completed" : "waiting"}
                  label={
                    connected ? ui.integrations.connected : ui.integrations.notConnected
                  }
                />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {provider.displayName}
              </p>
              <p className="mt-1 text-caption line-clamp-2">
                {provider.description}
              </p>
              <p className="mt-3 text-caption">
                {ui.integrations.lastSync(
                  formatIntegrationTimestamp(
                    provider.connection?.lastSyncAt ?? null,
                  ),
                )}
              </p>
              {!connected && (
                <Badge variant="default" className="mt-2">
                  {ui.integrations.available}
                </Badge>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
