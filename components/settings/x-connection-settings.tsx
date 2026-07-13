"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SuccessState } from "@/components/ui/success-state";
import {
  connectExternalService,
  disconnectExternalService,
  fetchExternalServiceCatalog,
  formatExternalServiceTimestamp,
} from "@/lib/integrations/external-services";
import type { ExternalServiceView } from "@/lib/integrations/external-services";
import {
  createXPostClient,
  fetchXConnectionStatusClient,
} from "@/lib/integrations/x/post";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

function XConnectionCard({
  service,
  busy,
  checking,
  onConnect,
  onDisconnect,
  onCheck,
  onTestPost,
  onReconnect,
}: {
  service: ExternalServiceView;
  busy: boolean;
  checking: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onCheck: () => void;
  onTestPost: () => void;
  onReconnect: () => void;
}) {
  const { connection } = service;
  const isConnected = connection.status === "connected";
  const needsReconnect = connection.status === "error";
  const connectDisabled =
    !service.featureEnabled || busy || connection.status === "pending";
  const username =
    connection.account?.username ??
    connection.account?.email?.replace(/^@/, "") ??
    null;

  return (
    <Card padding="md" className="border border-[var(--border-subtle)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] text-3xl ring-1 ring-[var(--border)]"
            aria-hidden
          >
            {service.icon}
          </span>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {service.serviceName}
              </h2>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                  isConnected
                    ? "bg-[var(--status-success-bg)] text-[var(--status-success)] ring-[var(--status-success)]/30"
                    : needsReconnect
                      ? "bg-[var(--status-error-bg)] text-[var(--status-error)] ring-[var(--status-error)]/30"
                      : "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)] ring-[var(--status-neutral)]/25",
                )}
              >
                {isConnected
                  ? ui.xSettings.statusConnected
                  : needsReconnect
                    ? ui.xSettings.statusError
                    : ui.externalServices.status[connection.status]}
              </span>
            </div>

            {(isConnected || needsReconnect) && username && (
              <div className="space-y-1 text-sm">
                <p className="text-foreground">
                  <span className="font-medium">{ui.xSettings.usernameLabel}:</span>{" "}
                  @{username}
                </p>
                {connection.account?.name && (
                  <p className="text-[var(--foreground-muted)]">
                    {connection.account.name}
                  </p>
                )}
                <p className="text-[var(--foreground-muted)]">
                  <span className="font-medium">
                    {ui.xSettings.lastConnectedLabel}:
                  </span>{" "}
                  {formatExternalServiceTimestamp(connection.connectedAt)}
                </p>
                {connection.lastUsedAt && (
                  <p className="text-[var(--foreground-muted)]">
                    <span className="font-medium">
                      {ui.xSettings.lastUsedLabel}:
                    </span>{" "}
                    {formatExternalServiceTimestamp(connection.lastUsedAt)}
                  </p>
                )}
              </div>
            )}

            {!service.featureEnabled && (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.externalServices.featureDisabledHint}
              </p>
            )}

            {connection.status === "error" && connection.errorMessage && (
              <p className="text-sm text-[var(--status-error)]">
                {connection.errorMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isConnected ? (
            <>
              <Button
                variant="secondary"
                disabled={busy || checking}
                onClick={onCheck}
              >
                {checking ? ui.xSettings.checking : ui.xSettings.checkConnection}
              </Button>
              <Button
                variant="secondary"
                disabled={busy || checking}
                onClick={onTestPost}
              >
                {ui.xSettings.testPostButton}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={onReconnect}
              >
                {ui.xSettings.reconnect}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={onDisconnect}>
                {ui.actions.disconnect}
              </Button>
            </>
          ) : needsReconnect ? (
            <Button disabled={connectDisabled} onClick={onReconnect}>
              {busy ? ui.xSettings.connecting : ui.xSettings.reconnect}
            </Button>
          ) : (
            <Button disabled={connectDisabled} onClick={onConnect}>
              {busy ? ui.xSettings.connecting : ui.actions.connect}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function XConnectionSettings() {
  const searchParams = useSearchParams();
  const [service, setService] = useState<ExternalServiceView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const catalog = await fetchExternalServiceCatalog();
      const xService = catalog.services.find((item) => item.serviceId === "x");
      setService(xService ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("x_error") === "1") {
      setError(ui.xSettings.connectError);
    }
    if (searchParams.get("connected") === "x") {
      const username = searchParams.get("username");
      setSuccess(
        username
          ? ui.xSettings.connectSuccessWithUsername(username)
          : ui.xSettings.connectSuccess,
      );
      void load();
    }
  }, [load, searchParams]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await connectExternalService("x");
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.xSettings.connectError);
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await disconnectExternalService("x");
      await load();
      setSuccess(ui.xSettings.disconnectSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await fetchXConnectionStatusClient();
      if (result.status === "ready") {
        setSuccess(
          result.permissionsOk
            ? `${ui.xSettings.checkSuccess}（${ui.xSettings.checkPermissionsOk}）`
            : `${ui.xSettings.checkSuccess}（${ui.xSettings.checkPermissionsMissing}）`,
        );
        await load();
      } else if ("message" in result) {
        setError(result.message);
        await load();
      } else {
        setError(ui.xSettings.connectError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.xSettings.connectError);
    } finally {
      setChecking(false);
    }
  };

  const handleTestPost = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await createXPostClient({ text: "", mode: "test" });
      if (result.status === "ready") {
        setSuccess(ui.xSettings.testPostSuccess);
        if (result.history?.tweetUrl) {
          setSuccess(
            `${ui.xSettings.testPostSuccess}: ${result.history.tweetUrl}`,
          );
        }
      } else if (result.status === "x_not_connected") {
        setError(result.message);
        await load();
      } else if ("message" in result) {
        setError(result.message);
      } else {
        setError(ui.xSettings.testPostFailed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.xSettings.testPostFailed);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <LoadingState message={ui.loading} />;
  }

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} />}
      {success && <SuccessState message={success} />}

      {!service ? (
        <Card padding="sm">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.xSettings.unavailable}
          </p>
        </Card>
      ) : (
        <>
          <XConnectionCard
            service={service}
            busy={busy}
            checking={checking}
            onConnect={() => void handleConnect()}
            onDisconnect={() => void handleDisconnect()}
            onCheck={() => void handleCheck()}
            onTestPost={() => void handleTestPost()}
            onReconnect={() => void handleConnect()}
          />
          {service.connection.status === "connected" && (
            <p className="text-sm">
              <Link
                href="/workspace/x"
                className="font-medium text-accent hover:underline"
              >
                {ui.xSettings.openWorkspace}
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
