"use client";

import { useCallback, useEffect, useState } from "react";

import { mergeConnectorProviderViews } from "@/lib/connectors";
import type { ConnectorProviderView } from "@/lib/connectors";
import { fetchIntegrationCatalog } from "@/lib/integrations/client";
import { ui } from "@/lib/i18n";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

import { ConnectorProviderCard } from "./connector-provider-card";

export function ConnectorsDashboard() {
  const [providers, setProviders] = useState<ConnectorProviderView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const catalog = await fetchIntegrationCatalog().catch(() => ({
        providers: [],
      }));
      setProviders(mergeConnectorProviderViews(catalog.providers));
      setError(null);
    } catch (err) {
      setProviders(mergeConnectorProviderViews());
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
    <div className="space-y-10 animate-fade-in">
      <header className="space-y-2">
        <h1 className="text-display text-foreground">{ui.connectors.title}</h1>
        <p className="text-body text-[var(--foreground-muted)]">
          {ui.connectors.subtitle}
        </p>
        <p className="text-caption">{ui.connectors.planningNote}</p>
      </header>

      {error && <ErrorState message={error} />}

      {providers.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.connectors.empty}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {providers.map((provider) => (
            <ConnectorProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </div>
  );
}
