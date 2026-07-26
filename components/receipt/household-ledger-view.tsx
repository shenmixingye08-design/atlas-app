"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";
import {
  RECEIPT_CATEGORIES,
  type LedgerEntry,
  type MonthlyAnalytics,
  type ReceiptCategory,
} from "@/lib/receipt/types";

export function HouseholdLedgerView() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [analytics, setAnalytics] = useState<MonthlyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const month = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    startTransition(() => {
      setLoading(true);
      setError(null);
    });

    void (async () => {
      try {
        const [entriesRes, analyticsRes] = await Promise.all([
          fetch("/api/receipt/entries", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`/api/receipt/analytics?month=${month}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (!entriesRes.ok || !analyticsRes.ok) {
          throw new Error(ui.household.loadError);
        }
        const entriesBody = (await entriesRes.json()) as {
          entries: LedgerEntry[];
        };
        const analyticsBody = (await analyticsRes.json()) as {
          analytics: MonthlyAnalytics;
        };
        if (cancelled) return;
        startTransition(() => {
          setEntries(entriesBody.entries);
          setAnalytics(analyticsBody.analytics);
          setLoading(false);
        });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        startTransition(() => {
          setError(err instanceof Error ? err.message : ui.household.loadError);
          setLoading(false);
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [month, startTransition]);

  async function changeCategory(id: string, category: ReceiptCategory) {
    const response = await fetch(`/api/receipt/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (!response.ok) {
      setError(ui.household.saveError);
      return;
    }
    const entriesRes = await fetch("/api/receipt/entries", { cache: "no-store" });
    const analyticsRes = await fetch(`/api/receipt/analytics?month=${month}`, {
      cache: "no-store",
    });
    if (entriesRes.ok && analyticsRes.ok) {
      const entriesBody = (await entriesRes.json()) as { entries: LedgerEntry[] };
      const analyticsBody = (await analyticsRes.json()) as {
        analytics: MonthlyAnalytics;
      };
      setEntries(entriesBody.entries);
      setAnalytics(analyticsBody.analytics);
    }
  }

  if (loading) return <LoadingState message={ui.household.loading} />;
  if (error) return <ErrorState title="エラー" message={error} />;

  return (
    <div className="space-y-8">
      {analytics ? (
        <Card padding="lg" className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {ui.household.monthlyHeading(analytics.yearMonth)}
          </p>
          <p className="text-3xl font-semibold text-foreground">
            ¥{analytics.totalSpend.toLocaleString("ja-JP")}
          </p>
          <p className="text-sm text-[var(--foreground-muted)]">
            {analytics.aiComment}
          </p>
          {analytics.deltaPercent != null ? (
            <p className="text-sm text-foreground">
              {ui.household.deltaLabel(analytics.deltaPercent)}
            </p>
          ) : null}
          <ul className="space-y-1 text-sm">
            {analytics.byCategory.map((row) => (
              <li key={row.category} className="flex justify-between gap-4">
                <span>{row.category}</span>
                <span>
                  ¥{row.amount.toLocaleString("ja-JP")}（
                  {Math.round(row.share * 100)}%）
                </span>
              </li>
            ))}
          </ul>
          {analytics.suggestions.length > 0 ? (
            <div className="space-y-1 pt-2">
              <p className="text-xs font-semibold text-accent">
                {ui.household.suggestionsHeading}
              </p>
              <ul className="list-inside list-disc text-sm text-[var(--foreground-muted)]">
                {analytics.suggestions.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.href = `/api/receipt/export?month=${month}`;
            }}
          >
            {ui.household.exportExcel}
          </Button>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-title text-foreground">{ui.household.entriesHeading}</h2>
        {entries.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-[var(--foreground-muted)]">
              {ui.household.empty}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Card padding="md" className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-foreground">
                      {entry.storeName} / {entry.itemName}
                    </p>
                    <p className="text-sm font-semibold">
                      ¥{entry.amountInclTax.toLocaleString("ja-JP")}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {entry.date} · {entry.paymentMethod}
                    {entry.moneyUse === "business" ? " · 経費" : ""}
                  </p>
                  <label className="block text-xs text-[var(--foreground-muted)]">
                    {ui.household.categoryLabel}
                    <select
                      className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-1.5 text-sm text-foreground"
                      value={entry.category}
                      onChange={(event) =>
                        void changeCategory(
                          entry.id,
                          event.target.value as ReceiptCategory,
                        )
                      }
                    >
                      {RECEIPT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
