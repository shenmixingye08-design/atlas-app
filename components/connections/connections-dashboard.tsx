"use client";

import { useCallback, useEffect, useState } from "react";

import { buildConnectionCenterViews } from "@/lib/connections";
import type { ProviderConnectionView } from "@/lib/connections";
import { fetchIntegrationCatalog } from "@/lib/integrations/client";
import { ui } from "@/lib/i18n";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

import { ConnectionProviderCard } from "./connection-provider-card";

export function ConnectionsDashboard() {
  const [providers, setProviders] = useState<ProviderConnectionView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const catalog = await fetchIntegrationCatalog().catch(() => ({
        providers: [],
      }));
      setProviders(buildConnectionCenterViews(catalog.providers));
      setError(null);
    } catch (err) {
      setProviders(buildConnectionCenterViews());
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-12 animate-fade-in">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.connections.title}</h1>
        <p className="max-w-2xl text-body text-[var(--foreground-muted)]">
          {ui.connections.subtitle}
        </p>
        <p className="text-caption">{ui.connections.planningNote}</p>
      </header>

      {error && <ErrorState message={error} />}

      {providers.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.connections.empty}
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {providers.map((provider) => (
            <ConnectionProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </div>
  );
}
