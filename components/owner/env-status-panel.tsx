"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EnvServiceId,
  OwnerEnvStatusSnapshot,
  OwnerEnvVarStatus,
} from "@/lib/owner/env-status/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchSnapshot(): Promise<OwnerEnvStatusSnapshot> {
  const response = await fetch("/api/owner/env-status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load env status");
  }
  return response.json() as Promise<OwnerEnvStatusSnapshot>;
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        configured
          ? "bg-[var(--success-bg)] text-emerald-100 ring-[var(--success)]/25"
          : "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]",
      )}
    >
      {configured
        ? ui.ownerEnvStatus.configured
        : ui.ownerEnvStatus.notConfigured}
    </span>
  );
}

function RequirementBadge({
  requirement,
}: {
  requirement: OwnerEnvVarStatus["requirement"];
}) {
  const label =
    requirement === "required"
      ? ui.ownerEnvStatus.required
      : requirement === "recommended"
        ? ui.ownerEnvStatus.recommended
        : ui.ownerEnvStatus.optional;

  return (
    <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
      {label}
    </span>
  );
}

function groupByService(
  variables: OwnerEnvVarStatus[],
): Array<{ service: EnvServiceId; label: string; rows: OwnerEnvVarStatus[] }> {
  const order: EnvServiceId[] = [
    "openai",
    "clerk",
    "stripe",
    "supabase",
    "google",
    "dropbox",
    "line",
    "vercel_cron",
    "atlas",
  ];
  const map = new Map<EnvServiceId, OwnerEnvVarStatus[]>();
  for (const row of variables) {
    const list = map.get(row.service) ?? [];
    list.push(row);
    map.set(row.service, list);
  }
  return order
    .filter((service) => map.has(service))
    .map((service) => ({
      service,
      label: map.get(service)![0]!.serviceLabel,
      rows: map.get(service)!,
    }));
}

export function EnvStatusPanel() {
  const [snapshot, setSnapshot] = useState<OwnerEnvStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchSnapshot());
    } catch {
      setError(ui.ownerEnvStatus.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () => (snapshot ? groupByService(snapshot.variables) : []),
    [snapshot],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-[var(--text-muted)]">
          {ui.ownerEnvStatus.eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {ui.ownerEnvStatus.title}
        </h1>
        <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
          {ui.ownerEnvStatus.subtitle}
        </p>
      </header>

      {loading && (
        <p className="text-sm text-[var(--text-muted)]">{ui.ownerEnvStatus.loading}</p>
      )}
      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-[var(--text-muted)]">
                {ui.ownerEnvStatus.summaryTotal}
              </p>
              <p className="mt-1 text-2xl font-semibold">{snapshot.summary.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--text-muted)]">
                {ui.ownerEnvStatus.summaryConfigured}
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {snapshot.summary.configured}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--text-muted)]">
                {ui.ownerEnvStatus.summaryMissing}
              </p>
              <p className="mt-1 text-2xl font-semibold">{snapshot.summary.missing}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--text-muted)]">
                {ui.ownerEnvStatus.summaryRequiredMissing}
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {snapshot.summary.requiredMissing}
              </p>
            </Card>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            {ui.ownerEnvStatus.generatedAt(
              new Date(snapshot.generatedAt).toLocaleString("ja-JP"),
            )}
          </p>

          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.service} className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">
                  {group.label}
                </h2>
                <Card className="overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50">
                        <tr>
                          <th className="px-4 py-3 font-medium">
                            {ui.ownerEnvStatus.columnKey}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {ui.ownerEnvStatus.columnPurpose}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {ui.ownerEnvStatus.columnRequirement}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {ui.ownerEnvStatus.columnStatus}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {ui.ownerEnvStatus.columnValue}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr
                            key={row.key}
                            className="border-b border-[var(--border)] last:border-0"
                          >
                            <td className="px-4 py-3 font-mono text-xs">
                              {row.key}
                            </td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">
                              {row.purpose}
                            </td>
                            <td className="px-4 py-3">
                              <RequirementBadge requirement={row.requirement} />
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge configured={row.configured} />
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                              {row.displayValue}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void load()}
            className="touch-target rounded-full px-4 py-2 text-sm font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-muted)] focus-ring"
          >
            {ui.ownerEnvStatus.refresh}
          </button>
        </>
      )}
    </div>
  );
}
