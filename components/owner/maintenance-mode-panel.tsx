"use client";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import type { MaintenanceModeConfig } from "@/lib/owner/system-status/maintenance";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

async function fetchMaintenance(): Promise<MaintenanceModeConfig> {
  const response = await fetch("/api/owner/maintenance", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed");
  return response.json() as Promise<MaintenanceModeConfig>;
}

async function patchMaintenance(
  patch: Partial<Omit<MaintenanceModeConfig, "updatedAt">>,
): Promise<MaintenanceModeConfig> {
  const response = await fetch("/api/owner/maintenance", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("Failed");
  return response.json() as Promise<MaintenanceModeConfig>;
}

function isoToDatetimeLocal(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function MaintenanceModePanel() {
  const [config, setConfig] = useState<MaintenanceModeConfig | null>(null);
  const [draft, setDraft] = useState({
    message: "",
    announcement: "",
    estimatedRecoveryAt: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchMaintenance();
      setConfig(next);
      setDraft({
        message: next.message,
        announcement: next.announcement,
        estimatedRecoveryAt: next.estimatedRecoveryAt ?? "",
      });
    } catch {
      setError(ui.systemPages.maintenanceUpdateError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      setConfig(await patchMaintenance({ enabled }));
    } catch {
      setError(ui.systemPages.maintenanceUpdateError);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDetails() {
    setBusy(true);
    setError(null);
    try {
      setConfig(
        await patchMaintenance({
          message: draft.message,
          announcement: draft.announcement,
          estimatedRecoveryAt: draft.estimatedRecoveryAt.trim() || null,
        }),
      );
    } catch {
      setError(ui.systemPages.maintenanceUpdateError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg" className="border-[var(--border)] bg-[var(--surface-muted)] text-foreground shadow-none">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{ui.systemPages.ownerMaintenanceTitle}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {ui.systemPages.ownerMaintenanceSubtitle}
          </p>
        </div>

        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={config?.enabled ?? false}
            disabled={busy || !config}
            onChange={(event) => void handleToggle(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)]"
          />
          {ui.systemPages.maintenanceEnabledLabel}
        </label>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">
              {ui.systemPages.maintenanceMessageLabel}
            </span>
            <textarea
              value={draft.message}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, message: event.target.value }))
              }
              className="min-h-[80px] w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">
              {ui.systemPages.recoveryEstimate}
            </span>
            <input
              type="datetime-local"
              value={isoToDatetimeLocal(draft.estimatedRecoveryAt)}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  estimatedRecoveryAt: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : "",
                }))
              }
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">
              {ui.systemPages.operatorAnnouncement}
            </span>
            <textarea
              value={draft.announcement}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, announcement: event.target.value }))
              }
              className="min-h-[80px] w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <Button
          type="button"
          disabled={busy}
          onClick={() => void handleSaveDetails()}
        >
          {ui.systemPages.saveMaintenance}
        </Button>

        <p className="text-xs text-[var(--text-muted)]">
          {ui.systemPages.ownerMaintenanceNote}
        </p>
      </div>
    </Card>
  );
}
