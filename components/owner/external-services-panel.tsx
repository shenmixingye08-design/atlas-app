"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type {
  OwnerExternalConnectionStatus,
  OwnerExternalServiceSnapshot,
  OwnerExternalServicesSnapshot,
} from "@/lib/owner/external-services/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<OwnerExternalServicesSnapshot> {
  const response = await fetch("/api/owner/external-services", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load external services");
  }
  return response.json() as Promise<OwnerExternalServicesSnapshot>;
}

async function postReconnect(
  serviceId: string,
): Promise<{ snapshot: OwnerExternalServicesSnapshot; authorizeUrl?: string }> {
  const response = await fetch("/api/owner/external-services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serviceId, action: "reconnect" }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to reconnect");
  }

  return response.json() as Promise<{
    snapshot: OwnerExternalServicesSnapshot;
    authorizeUrl?: string;
  }>;
}

function BoolBadge({
  value,
  yesLabel,
  noLabel,
}: {
  value: boolean | null;
  yesLabel: string;
  noLabel: string;
}) {
  if (value === null) {
    return (
      <span className="text-xs text-[var(--text-muted)]">
        {ui.ownerExternalServices.notApplicable}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        value
          ? "bg-[var(--success-bg)] text-emerald-100 ring-[var(--success)]/25"
          : "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]",
      )}
    >
      {value ? yesLabel : noLabel}
    </span>
  );
}

function ConnectionBadge({ status }: { status: OwnerExternalConnectionStatus }) {
  const connected = status === "connected";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        connected
          ? "bg-[var(--success-bg)] text-emerald-100 ring-[var(--success)]/25"
          : "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]",
      )}
    >
      {connected
        ? ui.ownerExternalServices.statusConnected
        : ui.ownerExternalServices.statusDisconnected}
    </span>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return ui.ownerExternalServices.neverConnected;
  return new Date(value).toLocaleString("ja-JP");
}

function ServiceRow({
  service,
  busy,
  onReconnect,
}: {
  service: OwnerExternalServiceSnapshot;
  busy: boolean;
  onReconnect: (serviceId: string) => void;
}) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-4 pr-3 align-top font-medium text-foreground">
        {service.label}
      </td>
      <td className="py-4 pr-3 align-top">
        <ConnectionBadge status={service.connectionStatus} />
      </td>
      <td className="py-4 pr-3 align-top">
        <BoolBadge
          value={service.envConfigured}
          yesLabel={ui.ownerExternalServices.envConfigured}
          noLabel={ui.ownerExternalServices.envMissing}
        />
      </td>
      <td className="py-4 pr-3 align-top">
        <BoolBadge
          value={service.oauthConfigured}
          yesLabel={ui.ownerExternalServices.oauthConfigured}
          noLabel={ui.ownerExternalServices.oauthMissing}
        />
      </td>
      <td className="py-4 pr-3 align-top">
        <BoolBadge
          value={service.webhookConfigured}
          yesLabel={ui.ownerExternalServices.webhookConfigured}
          noLabel={ui.ownerExternalServices.webhookMissing}
        />
      </td>
      <td className="py-4 pr-3 align-top">
        <BoolBadge
          value={service.apiEnabled}
          yesLabel={ui.ownerExternalServices.apiEnabled}
          noLabel={ui.ownerExternalServices.apiDisabled}
        />
      </td>
      <td className="py-4 pr-3 align-top text-[var(--text-secondary)] whitespace-nowrap">
        {formatTimestamp(service.lastConnectedAt)}
      </td>
      <td className="py-4 pr-3 align-top">
        {service.reconnectAvailable ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onReconnect(service.serviceId)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[var(--surface)] focus-ring disabled:opacity-50"
          >
            {ui.ownerExternalServices.reconnect}
          </button>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        )}
      </td>
      <td className="py-4 align-top">
        <Link
          href={service.settingsHref}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          {ui.ownerExternalServices.openSettings}
        </Link>
      </td>
    </tr>
  );
}

export function ExternalServicesPanel() {
  const [snapshot, setSnapshot] = useState<OwnerExternalServicesSnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSnapshot(await fetchSnapshot());
    } catch {
      setError(ui.error.generic);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReconnect(serviceId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await postReconnect(serviceId);
      setSnapshot(result.snapshot);
      if (result.authorizeUrl) {
        window.location.assign(result.authorizeUrl);
        return;
      }
    } catch {
      setError(ui.ownerExternalServices.reconnectError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-300/80">
          {ui.ownerExternalServices.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.ownerExternalServices.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.ownerExternalServices.subtitle}
        </p>
      </header>

      {error && (
        <Card
          padding="md"
          className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100"
        >
          {error}
        </Card>
      )}

      <Card
        padding="lg"
        className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none"
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {ui.ownerExternalServices.listTitle}
            </h2>
            {snapshot && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {ui.ownerExternalServices.summary(
                  snapshot.connectedCount,
                  snapshot.services.length,
                )}
              </p>
            )}
          </div>
          {snapshot && (
            <p className="text-xs text-[var(--text-secondary)]">
              {ui.ownerExternalServices.generatedAt(snapshot.generatedAt)}
            </p>
          )}
        </div>

        {!snapshot ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {ui.ownerExternalServices.loading}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="pb-3 pr-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.serviceColumn}
                  </th>
                  <th className="pb-3 pr-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.connectionColumn}
                  </th>
                  <th className="pb-3 pr-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.envColumn}
                  </th>
                  <th className="pb-3 pr-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.oauthColumn}
                  </th>
                  <th className="pb-3 pr-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.webhookColumn}
                  </th>
                  <th className="pb-3 pr-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.apiColumn}
                  </th>
                  <th className="pb-3 pr-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.lastConnectedColumn}
                  </th>
                  <th className="pb-3 pr-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.reconnectColumn}
                  </th>
                  <th className="pb-3 font-medium whitespace-nowrap">
                    {ui.ownerExternalServices.settingsColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.services.map((service) => (
                  <ServiceRow
                    key={service.serviceId}
                    service={service}
                    busy={busy}
                    onReconnect={(id) => void handleReconnect(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        {ui.ownerExternalServices.note}
      </p>
    </div>
  );
}
