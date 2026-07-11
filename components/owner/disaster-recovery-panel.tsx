"use client";

import { useCallback, useEffect, useState } from "react";

import type { DisasterRecoverySnapshot } from "@/lib/owner/disaster-recovery/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

async function fetchSnapshot(): Promise<DisasterRecoverySnapshot> {
  const response = await fetch("/api/owner/disaster-recovery", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load disaster recovery");
  return response.json() as Promise<DisasterRecoverySnapshot>;
}

async function postAction(
  body: Record<string, unknown>,
): Promise<DisasterRecoverySnapshot> {
  const response = await fetch("/api/owner/disaster-recovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Action failed");
  const json = (await response.json()) as {
    snapshot: DisasterRecoverySnapshot;
  };
  return json.snapshot;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function DisasterRecoveryPanel() {
  const [snapshot, setSnapshot] = useState<DisasterRecoverySnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSnapshot(await fetchSnapshot());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      setSnapshot(await postAction(body));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot && !error) {
    return <LoadingState message={ui.owner.drLoading} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {ui.owner.drTitle}
          </h1>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {ui.owner.drSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void run({ action: "process_queue" })}
          >
            {ui.owner.drProcessQueue}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void run({ action: "backup" })}
          >
            {ui.owner.drCreateBackup}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              window.open(
                "/api/owner/disaster-recovery?format=csv&section=incidents",
                "_blank",
              )
            }
          >
            {ui.owner.drCsvIncidents}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              window.open(
                "/api/owner/disaster-recovery?format=csv&section=recovery",
                "_blank",
              )
            }
          >
            {ui.owner.drCsvRecovery}
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {snapshot && (
        <>
          <Card padding="lg" className="shadow-[var(--shadow-soft)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label={ui.owner.drOpenIncidents}
                value={String(snapshot.openIncidents.length)}
              />
              <Stat
                label={ui.owner.drRetryCount}
                value={String(snapshot.recovery.totalRetries)}
              />
              <Stat
                label={ui.owner.drQueueCount}
                value={String(
                  snapshot.recovery.queuedJobs + snapshot.recovery.retryingJobs,
                )}
              />
              <Stat
                label={ui.owner.drFallbackCount}
                value={String(snapshot.recovery.activeFallbacks)}
              />
              <Stat
                label={ui.owner.drMaintenance}
                value={
                  snapshot.recovery.maintenanceEnabled
                    ? ui.owner.drOn
                    : ui.owner.drOff
                }
              />
              <Stat
                label={ui.owner.drLastBackup}
                value={
                  snapshot.lastBackup
                    ? formatDate(snapshot.lastBackup.createdAt)
                    : "—"
                }
              />
            </div>
            {snapshot.recovery.maintenanceEnabled && (
              <div className="mt-4">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void run({ action: "disable_maintenance" })}
                >
                  {ui.owner.drDisableMaintenance}
                </Button>
              </div>
            )}
          </Card>

          <Card padding="lg" className="shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 text-lg font-semibold">
              {ui.owner.drIncidentsTitle}
            </h2>
            {!snapshot.openIncidents.length ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.owner.drIncidentsEmpty}
              </p>
            ) : (
              <SimpleTable
                headers={[
                  ui.owner.drColAt,
                  ui.owner.drColKind,
                  ui.owner.drColTarget,
                  ui.owner.drColMessage,
                ]}
                rows={snapshot.openIncidents.map((row) => [
                  formatDate(row.at),
                  row.kind,
                  row.targetId,
                  row.message,
                ])}
              />
            )}
          </Card>

          <Card padding="lg" className="shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 text-lg font-semibold">
              {ui.owner.drFallbackTitle}
            </h2>
            {!snapshot.fallbacks.length ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.owner.drFallbackEmpty}
              </p>
            ) : (
              <SimpleTable
                headers={[
                  ui.owner.drColTarget,
                  ui.owner.drColMode,
                  ui.owner.drColMessage,
                  "",
                ]}
                rows={snapshot.fallbacks.map((row) => [
                  row.targetId,
                  row.mode,
                  row.reason,
                  row.targetId,
                ])}
                actionLabel={ui.owner.drClearFallback}
                onAction={(targetId) =>
                  void run({ action: "clear_fallback", targetId })
                }
                busy={busy}
              />
            )}
          </Card>

          <Card padding="lg" className="shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 text-lg font-semibold">
              {ui.owner.drQueueTitle}
            </h2>
            {!snapshot.queue.length ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.owner.drQueueEmpty}
              </p>
            ) : (
              <SimpleTable
                headers={[
                  ui.owner.drColKind,
                  ui.owner.drColTarget,
                  ui.owner.drColStatus,
                  ui.owner.drColAttempts,
                  ui.owner.drColMessage,
                ]}
                rows={snapshot.queue.slice(0, 30).map((row) => [
                  row.kind,
                  row.targetId,
                  row.status,
                  `${row.attempts}/${row.maxAttempts}`,
                  row.message,
                ])}
              />
            )}
          </Card>

          <Card padding="lg" className="shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 text-lg font-semibold">
              {ui.owner.drBackupTitle}
            </h2>
            {!snapshot.backups.length ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.owner.drBackupEmpty}
              </p>
            ) : (
              <div className="space-y-2">
                {snapshot.backups.map((backup) => (
                  <div
                    key={backup.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{backup.label}</div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        {formatDate(backup.createdAt)} ·{" "}
                        {backup.sections.join(", ")} · users{" "}
                        {backup.userIds.length}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run({ action: "restore", backupId: backup.id })
                      }
                    >
                      {ui.owner.drRestore}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card padding="lg" className="shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 text-lg font-semibold">
              {ui.owner.drHistoryTitle}
            </h2>
            {!snapshot.recoveryHistory.length ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.owner.drHistoryEmpty}
              </p>
            ) : (
              <SimpleTable
                headers={[
                  ui.owner.drColAt,
                  ui.owner.drColAction,
                  ui.owner.drColTarget,
                  ui.owner.drColMessage,
                ]}
                rows={snapshot.recoveryHistory.slice(0, 40).map((row) => [
                  formatDate(row.at),
                  row.action,
                  row.targetId,
                  row.message,
                ])}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] px-3 py-3">
      <div className="text-xs text-[var(--foreground-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  actionLabel,
  onAction,
  busy,
}: {
  headers: string[];
  rows: string[][];
  actionLabel?: string;
  onAction?: (id: string) => void;
  busy?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-[var(--foreground-muted)]">
            {headers.map((h) => (
              <th key={h || "action"} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={`${row[0]}-${idx}`}
              className="border-b border-[var(--border-subtle)] align-top"
            >
              {row.map((cell, cellIdx) => {
                if (actionLabel && onAction && cellIdx === row.length - 1) {
                  return (
                    <td key={cellIdx} className="px-2 py-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onAction(cell)}
                      >
                        {actionLabel}
                      </Button>
                    </td>
                  );
                }
                return (
                  <td key={cellIdx} className="px-2 py-2">
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
