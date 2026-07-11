"use client";

import { useCallback, useEffect, useState } from "react";

import type { AccountDeletionOwnerRow } from "@/lib/account-deletion/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

type Snapshot = {
  rows: AccountDeletionOwnerRow[];
  generatedAt: string;
};

async function fetchRows(): Promise<Snapshot> {
  const response = await fetch("/api/owner/account-deletions", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load account deletions");
  return response.json() as Promise<Snapshot>;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function AccountDeletionsPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSnapshot(await fetchRows());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const purgeDue = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/owner/account-deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge_due" }),
      });
      if (!response.ok) throw new Error("Failed to purge due accounts");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot && !error) {
    return <LoadingState message={ui.owner.accountDeletionsLoading} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {ui.owner.accountDeletionsTitle}
          </h1>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {ui.owner.accountDeletionsSubtitle}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void purgeDue()}
        >
          {ui.owner.accountDeletionsPurgeDue}
        </Button>
      </div>

      {error && <ErrorState message={error} />}

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        {!snapshot?.rows.length ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.owner.accountDeletionsEmpty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--foreground-muted)]">
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.accountDeletionsUser}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.accountDeletionsPlan}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.accountDeletionsRequested}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.accountDeletionsDeleteAt}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.accountDeletionsRestoreUntil}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.accountDeletionsDaysLeft}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-b border-[var(--border-subtle)]"
                  >
                    <td className="px-2 py-3">
                      <div className="font-medium text-foreground">
                        {row.email ?? row.userId}
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        {row.userId}
                      </div>
                    </td>
                    <td className="px-2 py-3">{row.planName}</td>
                    <td className="px-2 py-3">{formatDate(row.requestedAt)}</td>
                    <td className="px-2 py-3">{formatDate(row.deleteAfter)}</td>
                    <td className="px-2 py-3">
                      {formatDate(row.restoreDeadline)}
                    </td>
                    <td className="px-2 py-3">{row.daysRemaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
