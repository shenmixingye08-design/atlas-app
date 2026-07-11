"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { AccountDeletionRecord } from "@/lib/account-deletion/types";
import type { UserBillingSummary } from "@/lib/billing";
import { fetchBillingSummary, openBillingPortal } from "@/lib/billing";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

async function fetchDeletionStatus(): Promise<AccountDeletionRecord | null> {
  const response = await fetch("/api/account/deletion", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load account deletion status");
  }
  const body = (await response.json()) as { record: AccountDeletionRecord | null };
  return body.record;
}

async function postDeletionAction(
  action: "withdraw" | "cancel" | "purge",
  confirmation?: string,
): Promise<AccountDeletionRecord | null> {
  const response = await fetch("/api/account/deletion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, confirmation }),
  });
  const body = (await response.json()) as {
    record?: AccountDeletionRecord | null;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }
  return body.record ?? null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function AccountSettings() {
  const [summary, setSummary] = useState<UserBillingSummary | null>(null);
  const [record, setRecord] = useState<AccountDeletionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);

  const load = useCallback(async () => {
    try {
      const [billing, deletion] = await Promise.all([
        fetchBillingSummary(),
        fetchDeletionStatus(),
      ]);
      setSummary(billing);
      setRecord(deletion);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePortal = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await openBillingPortal();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.connectFailed);
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!window.confirm(ui.accountManagement.withdrawConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      const next = await postDeletionAction("withdraw");
      setRecord(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelDeletion = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await postDeletionAction("cancel");
      setRecord(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const handlePurge = async () => {
    setBusy(true);
    setError(null);
    try {
      await postDeletionAction("purge", purgeConfirm);
      setShowPurgeDialog(false);
      setPurgeConfirm("");
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState message={ui.accountManagement.loading} />;
  }

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} />}

      <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)]">
        <h2 className="text-title text-foreground">
          {ui.accountManagement.planSection}
        </h2>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.accountManagement.currentPlan}:{" "}
          <span className="font-medium text-foreground">
            {summary?.plan.name ?? "—"}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/settings/billing"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--surface-muted)] px-4 text-sm font-medium text-foreground hover:bg-[var(--secondary-hover)]"
          >
            {ui.accountManagement.openBilling}
          </Link>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void handlePortal()}
          >
            {ui.accountManagement.cancelSubscription}
          </Button>
        </div>
      </Card>

      <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)]">
        <h2 className="text-title text-foreground">
          {ui.accountManagement.exportSection}
        </h2>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.accountManagement.exportHint}
        </p>
        <Link
          href="/settings/export"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--surface-muted)] px-4 text-sm font-medium text-foreground hover:bg-[var(--secondary-hover)]"
        >
          {ui.accountManagement.openExport}
        </Link>
      </Card>

      <Card padding="lg" className="space-y-4 shadow-[var(--shadow-soft)]">
        <h2 className="text-title text-foreground">
          {ui.accountManagement.withdrawSection}
        </h2>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.accountManagement.withdrawHint}
        </p>

        {record?.status === "scheduled" ? (
          <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
            <p className="text-sm text-foreground">
              {ui.accountManagement.scheduledStatus}
            </p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--foreground-muted)]">
                  {ui.accountManagement.deleteAfter}
                </dt>
                <dd className="font-medium">{formatDate(record.deleteAfter)}</dd>
              </div>
              <div>
                <dt className="text-[var(--foreground-muted)]">
                  {ui.accountManagement.requestedAt}
                </dt>
                <dd className="font-medium">{formatDate(record.requestedAt)}</dd>
              </div>
            </dl>
            <ul className="space-y-1 text-xs text-[var(--foreground-muted)]">
              <li>
                Stripe: {record.steps.stripeCanceled ? "済" : "—"} / Automation:{" "}
                {record.steps.automationsStopped ? "停止" : "—"} / 通知:{" "}
                {record.steps.notificationsStopped ? "停止" : "—"} / 連携:{" "}
                {record.steps.integrationsDisconnected ? "解除" : "—"}
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void handleCancelDeletion()}
              >
                {ui.accountManagement.cancelDeletion}
              </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => setShowPurgeDialog(true)}
            >
              {ui.accountManagement.purgeNow}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="danger"
          size="sm"
          disabled={busy}
          onClick={() => void handleWithdraw()}
        >
          {ui.accountManagement.withdrawButton}
        </Button>
      )}
    </Card>

    {showPurgeDialog && (
      <Card padding="lg" className="space-y-4 border border-[var(--status-error)]/30 shadow-[var(--shadow-soft)]">
        <h3 className="text-base font-semibold text-foreground">
          {ui.accountManagement.purgeDialogTitle}
        </h3>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.accountManagement.purgeDialogHint}
        </p>
        <input
          className="w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-sm"
          value={purgeConfirm}
          onChange={(event) => setPurgeConfirm(event.target.value)}
          placeholder="DELETE"
          aria-label="DELETE confirmation"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setShowPurgeDialog(false);
              setPurgeConfirm("");
            }}
          >
            {ui.accountManagement.closeDialog}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy || purgeConfirm !== "DELETE"}
            onClick={() => void handlePurge()}
          >
            {ui.accountManagement.confirmPurge}
          </Button>
        </div>
      </Card>
    )}

      <p className="text-caption">
        <Link href="/settings" className="text-[var(--accent)] hover:underline">
          ← {ui.nav.settings}
        </Link>
      </p>
    </div>
  );
}
