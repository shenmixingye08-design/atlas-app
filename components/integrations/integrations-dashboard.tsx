"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { IntegrationProviderView } from "@/lib/integrations/types";
import {
  connectIntegration,
  disconnectIntegration,
  fetchIntegrationCatalog,
  formatIntegrationTimestamp,
} from "@/lib/integrations/client";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SuccessState } from "@/components/ui/success-state";

export function IntegrationsDashboard() {
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<IntegrationProviderView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const catalog = await fetchIntegrationCatalog();
      setProviders(catalog.providers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const connected = searchParams.get("connected");
    if (oauthError) {
      setError(oauthError);
    } else if (connected === "google_drive") {
      setSuccessMessage(ui.integrations.googleDriveConnected);
      void loadCatalog();
    }
  }, [searchParams, loadCatalog]);

  const handleConnect = async (providerId: IntegrationProviderView["id"]) => {
    setBusyId(providerId);
    setError(null);
    try {
      await connectIntegration(providerId);
      if (providerId !== "google_drive") await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.connectFailed);
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    setBusyId(connectionId);
    try {
      await disconnectIntegration(connectionId);
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.disconnectFailed);
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-12 animate-fade-up">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.integrations.title}</h1>
        <p className="text-body">{ui.integrations.subtitle}</p>
      </header>

      {successMessage && <SuccessState message={successMessage} />}
      {error && <ErrorState message={error} />}

      <div className="rounded-[var(--radius-2xl)] bg-[var(--card)] px-6 shadow-[var(--shadow-md)] sm:px-8">
        {providers.map((provider) => {
          const connected = provider.connection?.connected === true;
          return (
            <div key={provider.id} className="atlas-row">
              <div className="flex min-w-0 items-center gap-4">
                <span className="text-xl" aria-hidden="true">
                  {provider.icon}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {provider.displayName}
                  </p>
                  <p className="text-caption">
                    {connected
                      ? `${ui.integrations.connected} · ${formatIntegrationTimestamp(provider.connection?.lastSyncAt ?? null)}`
                      : ui.integrations.notConnected}
                  </p>
                </div>
              </div>
              {connected && provider.connection ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void handleDisconnect(provider.connection!.id)}
                >
                  {ui.actions.disconnect}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyId !== null}
                  isLoading={busyId === provider.id}
                  onClick={() => void handleConnect(provider.id)}
                >
                  {ui.actions.connect}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
