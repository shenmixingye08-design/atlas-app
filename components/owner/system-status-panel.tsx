"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  SystemServiceSnapshot,
  SystemServiceStatus,
  SystemStatusSnapshot,
} from "@/lib/owner/system-status/types";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerPercent } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<SystemStatusSnapshot> {
  const response = await fetch("/api/owner/system-status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load system status");
  }
  return response.json() as Promise<SystemStatusSnapshot>;
}

async function patchStatus(input: {
  serviceId: string;
  status: SystemServiceStatus | null;
}): Promise<SystemStatusSnapshot> {
  const response = await fetch("/api/owner/system-status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to update system status");
  }

  return response.json() as Promise<SystemStatusSnapshot>;
}

const STATUS_LABELS: Record<SystemServiceStatus, string> = {
  operational: ui.systemStatus.statusOperational,
  outage: ui.systemStatus.statusOutage,
  maintenance: ui.systemStatus.statusMaintenance,
};

const STATUS_CLASSES: Record<SystemServiceStatus, string> = {
  operational:
    "bg-[var(--success-bg)] text-emerald-100 ring-[var(--success)]/25",
  outage: "bg-[var(--error-bg)] text-rose-100 ring-[var(--error)]/25",
  maintenance: "bg-[var(--warning-bg)] text-amber-100 ring-[var(--warning)]/25",
};

function StatusBadge({ status }: { status: SystemServiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_CLASSES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function ServiceRow({
  service,
  busy,
  onStatusChange,
}: {
  service: SystemServiceSnapshot;
  busy: boolean;
  onStatusChange: (serviceId: string, status: SystemServiceStatus | null) => void;
}) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-4 pr-4 align-top font-medium text-foreground">{service.label}</td>
      <td className="py-4 pr-4 align-top">
        <StatusBadge status={service.status} />
      </td>
      <td className="py-4 pr-4 align-top text-[var(--text-secondary)]">
        {formatOwnerPercent(service.uptimePercent)}
        {service.isEstimated && (
          <span className="ml-2 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
            {ui.systemStatus.estimatedBadge}
          </span>
        )}
      </td>
      <td className="py-4 align-top">
        <select
          value={service.status}
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value as SystemServiceStatus;
            onStatusChange(
              service.serviceId,
              value === "operational" ? null : value,
            );
          }}
          className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-foreground focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
          aria-label={ui.systemStatus.statusSelectLabel(service.label)}
        >
          <option value="operational">{ui.systemStatus.statusOperational}</option>
          <option value="outage">{ui.systemStatus.statusOutage}</option>
          <option value="maintenance">{ui.systemStatus.statusMaintenance}</option>
        </select>
      </td>
    </tr>
  );
}

export function SystemStatusPanel() {
  const [snapshot, setSnapshot] = useState<SystemStatusSnapshot | null>(null);
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

  async function handleStatusChange(
    serviceId: string,
    status: SystemServiceStatus | null,
  ) {
    setBusy(true);
    setError(null);
    try {
      setSnapshot(await patchStatus({ serviceId, status }));
    } catch {
      setError(ui.systemStatus.updateError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-300/80">
          {ui.systemStatus.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.systemStatus.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.systemStatus.subtitle}
        </p>
      </header>

      {error && (
        <Card padding="md" className="border-rose-400/30 bg-[var(--error-bg)] text-rose-100">
          {error}
        </Card>
      )}

      {snapshot && snapshot.issueCount > 0 && (
        <Card padding="md" className="border-amber-400/30 bg-amber-500/10 text-amber-100">
          {ui.systemStatus.issueAlert(snapshot.issueCount)}
        </Card>
      )}

      <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{ui.systemStatus.listTitle}</h2>
            {snapshot && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {ui.systemStatus.summary(
                  snapshot.operationalCount,
                  snapshot.services.length,
                )}
              </p>
            )}
          </div>
          {snapshot && (
            <p className="text-xs text-[var(--text-secondary)]">
              {ui.systemStatus.generatedAt(snapshot.generatedAt)}
            </p>
          )}
        </div>

        {!snapshot ? (
          <p className="text-sm text-[var(--text-secondary)]">{ui.systemStatus.loading}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="pb-3 pr-4 font-medium">
                    {ui.systemStatus.serviceColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.systemStatus.statusColumn}
                  </th>
                  <th className="pb-3 pr-4 font-medium">
                    {ui.systemStatus.uptimeColumn}
                  </th>
                  <th className="pb-3 font-medium">
                    {ui.systemStatus.actionColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.services.map((service) => (
                  <ServiceRow
                    key={service.serviceId}
                    service={service}
                    busy={busy}
                    onStatusChange={(serviceId, status) =>
                      void handleStatusChange(serviceId, status)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--text-muted)]">{ui.systemStatus.note}</p>
      <p className="text-xs text-[var(--text-muted)]">
        {ui.systemStatus.publicStatusNote}{" "}
        <a href="/status" className="text-[var(--accent)] hover:underline">
          /status
        </a>
      </p>
    </div>
  );
}
