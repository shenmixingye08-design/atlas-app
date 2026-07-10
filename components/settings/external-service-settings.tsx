"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import type {
  ExternalServiceStatus,
  ExternalServiceView,
} from "@/lib/integrations/external-services";
import {
  connectExternalService,
  disconnectExternalService,
  fetchExternalServiceCatalog,
  formatExternalServiceTimestamp,
} from "@/lib/integrations/external-services";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SuccessState } from "@/components/ui/success-state";

const STATUS_LABELS: Record<ExternalServiceStatus, string> = {
  disconnected: ui.externalServices.status.disconnected,
  pending: ui.externalServices.status.pending,
  connected: ui.externalServices.status.connected,
  error: ui.externalServices.status.error,
};

const STATUS_CLASSES: Record<ExternalServiceStatus, string> = {
  disconnected:
    "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)] ring-[var(--status-neutral)]/25",
  pending:
    "bg-[var(--status-warning-bg)] text-[var(--status-warning)] ring-[var(--status-warning)]/30",
  connected:
    "bg-[var(--status-success-bg)] text-[var(--status-success)] ring-[var(--status-success)]/30",
  error:
    "bg-[var(--status-error-bg)] text-[var(--status-error)] ring-[var(--status-error)]/30",
};

function ExternalServiceCard({
  service,
  busy,
  onConnect,
  onDisconnect,
}: {
  service: ExternalServiceView;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { connection } = service;
  const isConnected = connection.status === "connected";
  const connectDisabled =
    !service.featureEnabled || busy || connection.status === "pending";

  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] text-2xl ring-1 ring-[var(--border)]"
            aria-hidden
          >
            {service.icon}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">
                {service.serviceName}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                  STATUS_CLASSES[connection.status],
                )}
              >
                {STATUS_LABELS[connection.status]}
              </span>
            </div>

            <p className="text-sm text-[var(--foreground-muted)]">
              <span className="font-medium text-foreground">
                {ui.externalServices.purposesLabel}:
              </span>{" "}
              {service.purposes.join("、")}
            </p>

            {connection.account && (
              <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--background-subtle)] p-3">
                {connection.account.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={connection.account.pictureUrl}
                    alt=""
                    className="h-10 w-10 rounded-full ring-1 ring-[var(--border)]"
                  />
                ) : (
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-foreground ring-1 ring-[var(--border)]"
                    aria-hidden
                  >
                    {connection.account.email.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-caption font-medium text-foreground">
                    {ui.externalServices.accountLabel}
                  </p>
                  <p className="truncate text-sm font-medium text-foreground">
                    {connection.account.name ?? connection.account.email}
                  </p>
                  <p className="truncate text-caption text-[var(--foreground-muted)]">
                    {connection.account.email}
                  </p>
                </div>
              </div>
            )}

            <p className="text-caption">
              {ui.externalServices.lastConnectedLabel}:{" "}
              {formatExternalServiceTimestamp(connection.connectedAt)}
            </p>

            <div>
              <p className="text-caption font-medium text-foreground">
                {ui.externalServices.plannedFeaturesLabel}
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {connection.features.map((feature) => (
                  <li
                    key={feature}
                    className="rounded-full bg-[var(--background-subtle)] px-2.5 py-0.5 text-xs text-[var(--foreground-muted)]"
                  >
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {connection.errorMessage && (
              <p className="text-sm text-[var(--status-error)]">
                {service.serviceId === "google"
                  ? ui.externalServices.googleConnectError
                  : connection.errorMessage}
              </p>
            )}

            {!service.featureEnabled && !isConnected && (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.externalServices.featureDisabledHint}
              </p>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap lg:flex-col lg:items-end">
          {isConnected ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={onDisconnect}
            >
              {ui.actions.disconnect}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              disabled={connectDisabled}
              isLoading={busy || connection.status === "pending"}
              onClick={onConnect}
            >
              {ui.actions.connect}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function ExternalServiceSettings() {
  const searchParams = useSearchParams();
  const [services, setServices] = useState<ExternalServiceView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const catalog = await fetchExternalServiceCatalog();
      setServices(catalog.services);
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
    const googleError = searchParams.get("google_error");
    const connected = searchParams.get("connected");

    if (googleError === "1") {
      setError(ui.externalServices.googleConnectError);
      setSuccessMessage(null);
    } else if (connected === "google") {
      const account = searchParams.get("account");
      setSuccessMessage(
        account
          ? `${ui.externalServices.googleConnectSuccess}（${account}）`
          : ui.externalServices.googleConnectSuccess,
      );
      setError(null);
      void loadCatalog();
    }
  }, [searchParams, loadCatalog]);

  const handleConnect = async (serviceId: ExternalServiceView["serviceId"]) => {
    setBusyId(serviceId);
    setError(null);
    setSuccessMessage(null);
    try {
      await connectExternalService(serviceId);
      if (serviceId !== "google") {
        await loadCatalog();
      }
    } catch (err) {
      setError(
        serviceId === "google"
          ? ui.externalServices.googleConnectError
          : err instanceof Error
            ? err.message
            : ui.error.connectFailed,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (
    serviceId: ExternalServiceView["serviceId"],
  ) => {
    setBusyId(serviceId);
    setError(null);
    setSuccessMessage(null);
    try {
      await disconnectExternalService(serviceId);
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.disconnectFailed);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="external-services-heading" className="space-y-4">
      <div>
        <h2 id="external-services-heading" className="text-title text-foreground">
          {ui.externalServices.settingsTitle}
        </h2>
        <p className="mt-1 text-caption text-[var(--foreground-muted)]">
          {ui.externalServices.settingsHint}
        </p>
      </div>

      {successMessage && <SuccessState message={successMessage} />}
      {error && <ErrorState message={error} />}

      {isLoading ? (
        <LoadingState message={ui.loading} />
      ) : (
        <Card padding="lg" className="shadow-[var(--shadow-soft)]">
          <ul className="space-y-4">
            {services.map((service) => (
              <ExternalServiceCard
                key={service.serviceId}
                service={service}
                busy={busyId === service.serviceId}
                onConnect={() => void handleConnect(service.serviceId)}
                onDisconnect={() => void handleDisconnect(service.serviceId)}
              />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
