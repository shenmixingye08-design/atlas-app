"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ui } from "@/lib/i18n";
import {
  saveSmartProfileFact,
  snoozeFields,
  type FieldSuggestion,
  type SmartProfileSuggestionModel,
} from "@/lib/smart-profile-suggestion";

type SmartProfileSuggestionSheetProps = {
  open: boolean;
  model: SmartProfileSuggestionModel;
  onClose: () => void;
  onSaved?: () => void;
};

export function SmartProfileSuggestionSheet({
  open,
  model,
  onClose,
  onSaved,
}: SmartProfileSuggestionSheetProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<FieldSuggestion[]>(model.suggestions);

  useEffect(() => {
    if (!open) return;
    setRemaining(model.suggestions);
    setDrafts(
      Object.fromEntries(
        model.suggestions.map((item) => [item.key, item.suggestedValue ?? ""]),
      ),
    );
    setActiveKey(model.suggestions[0]?.key ?? null);
    setMessage(null);
    setError(null);
  }, [open, model]);

  const active = useMemo(
    () => remaining.find((item) => item.key === activeKey) ?? remaining[0] ?? null,
    [activeKey, remaining],
  );

  const recurringOnly =
    remaining.length > 0 && remaining.every((item) => item.reason === "recurring");

  if (!open || remaining.length === 0) return null;

  async function handleSave() {
    if (!active) return;
    const value = (drafts[active.key] ?? "").trim();
    if (!value) {
      setError(ui.smartProfileSuggestion.valuePlaceholder);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      saveSmartProfileFact(active.key, value);
      const next = remaining.filter((item) => item.key !== active.key);
      setRemaining(next);
      setMessage(ui.smartProfileSuggestion.saved);
      setActiveKey(next[0]?.key ?? null);
      onSaved?.();
      if (next.length === 0) {
        window.setTimeout(() => onClose(), 700);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.smartProfileSuggestion.saveError,
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    snoozeFields(remaining.map((item) => item.key));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        aria-label={ui.smartProfileSuggestion.close}
        onClick={handleSkip}
      />
      <Card
        padding="lg"
        className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-lg)] animate-fade-up sm:mx-4 sm:rounded-[var(--radius-2xl)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-profile-suggestion-title"
      >
        <p className="text-caption text-accent">
          {ui.smartProfileSuggestion.sheetEyebrow}
        </p>
        <h2
          id="smart-profile-suggestion-title"
          className="mt-2 text-title text-foreground"
        >
          {recurringOnly
            ? ui.smartProfileSuggestion.recurringTitle
            : ui.smartProfileSuggestion.sheetTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          {recurringOnly
            ? ui.smartProfileSuggestion.recurringLead
            : ui.smartProfileSuggestion.sheetLead}
        </p>

        {!recurringOnly && model.missingLabels.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold tracking-wide text-foreground">
              {ui.smartProfileSuggestion.missingHeading}
            </p>
            <ul className="space-y-1.5">
              {model.missingLabels.map((label) => (
                <li
                  key={label}
                  className="text-sm text-[var(--foreground-muted)]"
                >
                  ・{label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold tracking-wide text-foreground">
            {ui.smartProfileSuggestion.benefitsHeading}
          </p>
          <ul className="space-y-1.5 text-sm text-[var(--foreground-muted)]">
            <li>✓ {ui.smartProfileSuggestion.benefitAuto}</li>
            <li>✓ {ui.smartProfileSuggestion.benefitFaster}</li>
            <li>✓ {ui.smartProfileSuggestion.benefitYours}</li>
          </ul>
        </div>

        {remaining.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {remaining.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveKey(item.key)}
                className={
                  item.key === active?.key
                    ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-[var(--accent-foreground)]"
                    : "rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--foreground-muted)]"
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {active && (
          <div className="mt-5 space-y-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                {active.label}
              </span>
              <Input
                value={drafts[active.key] ?? ""}
                placeholder={ui.smartProfileSuggestion.valuePlaceholder}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [active.key]: event.target.value,
                  }))
                }
                className="min-h-[48px]"
              />
            </label>
            <p className="text-xs text-[var(--foreground-muted)]">
              {active.benefit}
            </p>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm text-accent">{message}</p>
        )}
        {error && (
          <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full min-h-[48px]"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving
              ? ui.smartProfileSuggestion.inlineSaving
              : ui.smartProfileSuggestion.openRegister}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full min-h-[48px]"
            disabled={saving}
            onClick={handleSkip}
          >
            {ui.smartProfileSuggestion.skip}
          </Button>
        </div>
      </Card>
    </div>
  );
}
