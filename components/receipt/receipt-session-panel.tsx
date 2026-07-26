"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ui } from "@/lib/i18n";
import {
  RECEIPT_CATEGORIES,
  type ReceiptCategory,
  type ReceiptSession,
} from "@/lib/receipt/types";

type ReceiptSessionPanelProps = {
  session: ReceiptSession;
  onUpdated: (session: ReceiptSession) => void;
};

export function ReceiptSessionPanel({
  session,
  onUpdated,
}: ReceiptSessionPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<ReceiptCategory>(
    session.suggestedCategory,
  );

  async function confirm(extra?: {
    registerAsExpense?: boolean;
  }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/receipt/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          fieldAnswers: answers,
          category,
          registerAsExpense: extra?.registerAsExpense,
        }),
      });
      const body = (await response.json()) as {
        session?: ReceiptSession;
        error?: string;
      };
      if (!response.ok || !body.session) {
        throw new Error(body.error ?? ui.household.confirmError);
      }
      onUpdated(body.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.household.confirmError);
    } finally {
      setBusy(false);
    }
  }

  if (session.status === "failed") {
    return (
      <Card padding="lg" className="space-y-2">
        <p className="font-medium text-foreground">{ui.household.failedTitle}</p>
        <p className="text-sm text-[var(--foreground-muted)]">
          {session.error}
        </p>
      </Card>
    );
  }

  if (session.status === "registered") {
    return (
      <Card padding="lg" className="space-y-3">
        <p className="font-medium text-foreground">
          {ui.household.registeredTitle}
        </p>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.household.registeredBody(session.entriesPreview.length)}
        </p>
        <ul className="space-y-1 text-sm">
          {session.entriesPreview.slice(0, 6).map((row, index) => (
            <li key={`${row.itemName}-${index}`}>
              {row.date} {row.storeName} {row.itemName} ¥
              {row.amountInclTax.toLocaleString("ja-JP")}
            </li>
          ))}
        </ul>
        {session.suggestions.length > 0 ? (
          <ul className="list-inside list-disc text-sm text-[var(--foreground-muted)]">
            {session.suggestions.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.href = "/household";
          }}
        >
          {ui.household.openLedger}
        </Button>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <p className="font-medium text-foreground">{ui.household.confirmTitle}</p>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          {ui.household.confirmSubtitle}
        </p>
      </div>

      {session.status === "needs_confirmation"
        ? session.pendingFields.map((field) => (
            <div key={field.field} className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {ui.household.lowConfidence(field.label)}
              </p>
              <div className="flex flex-wrap gap-2">
                {field.candidates.map((candidate) => (
                  <Button
                    key={candidate}
                    size="sm"
                    variant={
                      answers[field.field] === candidate ? "primary" : "secondary"
                    }
                    onClick={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [field.field]: candidate,
                      }))
                    }
                  >
                    {candidate}
                  </Button>
                ))}
              </div>
              <Input
                placeholder={ui.household.manualInput}
                value={answers[field.field] ?? field.currentValue ?? ""}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [field.field]: event.target.value,
                  }))
                }
              />
            </div>
          ))
        : null}

      <label className="block text-xs text-[var(--foreground-muted)]">
        {ui.household.categoryLabel}
        <select
          className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-1.5 text-sm"
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as ReceiptCategory)
          }
        >
          {RECEIPT_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {session.status === "awaiting_expense_choice" ||
      session.askExpenseConfirmation ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{ui.household.expenseQuestion}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void confirm({ registerAsExpense: true })}
            >
              {ui.household.expenseYes}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void confirm({ registerAsExpense: false })}
            >
              {ui.household.expenseNo}
            </Button>
          </div>
        </div>
      ) : (
        <Button disabled={busy} onClick={() => void confirm()}>
          {busy ? ui.household.confirming : ui.household.confirmSubmit}
        </Button>
      )}

      {error ? (
        <p className="text-sm text-[var(--status-error)]">{error}</p>
      ) : null}
    </Card>
  );
}
