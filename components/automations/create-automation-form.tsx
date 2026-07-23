"use client";

import { useEffect, useMemo, useState } from "react";

import type { AutomationFormState } from "@/lib/automations/form-utils";
import {
  WEEKDAY_LABELS,
  buildCreateInputFromForm,
  buildScheduleLabel,
  defaultAutomationFormState,
  syncExecutionFlowFromJobText,
} from "@/lib/automations/form-utils";
import { createAutomation } from "@/lib/automations/client";
import {
  applyWorkProfileToFormState,
  getSuggestionForText,
  recordAutomationCreated,
} from "@/lib/user-profile";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";

import { ExecutionLevelSelector } from "./execution-level-selector";
import { ExecutionModeSelector } from "./execution-mode-selector";
import { ExecutionFlowEditor } from "./execution-flow-editor";
import { SnsBatchSelector } from "./sns-batch-selector";

type CreateAutomationFormProps = {
  initialState?: Partial<AutomationFormState>;
  onCreated: () => void;
  onCancel: () => void;
};

export function CreateAutomationForm({
  initialState,
  onCreated,
  onCancel,
}: CreateAutomationFormProps) {
  const [form, setForm] = useState(() =>
    defaultAutomationFormState(initialState),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileApplied, setProfileApplied] = useState(false);

  const suggestion = useMemo(
    () => getSuggestionForText(`${form.title} ${form.assignment}`),
    [form.title, form.assignment],
  );

  useEffect(() => {
    setForm((prev) => applyWorkProfileToFormState(prev));
    setProfileApplied(true);
  }, []);

  const update = <K extends keyof AutomationFormState>(
    key: K,
    value: AutomationFormState[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title" || key === "assignment") {
        return syncExecutionFlowFromJobText(next);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.assignment.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      const input = buildCreateInputFromForm(form);
      await createAutomation(input);
      recordAutomationCreated(input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card padding="lg" className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-title text-foreground">{ui.habits.registerTitle}</h2>
        <p className="mt-2 text-body text-[var(--foreground-muted)]">
          {ui.habits.registerSubtitle}
        </p>
      </div>

      {error && <ErrorState message={error} />}

      {suggestion && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-accent/20 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            {ui.workProfile.suggestionBanner(suggestion.summary)}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setForm((prev) => applyWorkProfileToFormState(prev));
              setProfileApplied(true);
            }}
          >
            {profileApplied
              ? ui.workProfile.applySuggestion
              : ui.workProfile.applySuggestion}
          </Button>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label={ui.habits.fieldTitle}
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="例: 週次ブログ作成"
        />

        <div>
          <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
            {ui.habits.fieldFrequency}
          </label>
          <select
            value={form.frequency}
            onChange={(e) =>
              update("frequency", e.target.value as AutomationFormState["frequency"])
            }
            className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25"
          >
            <option value="daily">{ui.habits.frequencyDaily}</option>
            <option value="weekly">{ui.habits.frequencyWeekly}</option>
            <option value="monthly">{ui.habits.frequencyMonthly}</option>
            <option value="once">{ui.habits.frequencyOnce}</option>
          </select>
        </div>

        {form.frequency === "weekly" && (
          <div>
            <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
              {ui.habits.fieldDayOfWeek}
            </label>
            <select
              value={form.dayOfWeek}
              onChange={(e) => update("dayOfWeek", Number.parseInt(e.target.value, 10))}
              className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25"
            >
              {WEEKDAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        {form.frequency === "monthly" && (
          <Input
            label={ui.habits.fieldDayOfMonth}
            type="number"
            min={1}
            max={31}
            value={form.dayOfMonth}
            onChange={(e) =>
              update("dayOfMonth", Number.parseInt(e.target.value, 10) || 1)
            }
          />
        )}

        {form.frequency === "once" ? (
          <Input
            label={ui.habits.fieldOnceAt}
            type="datetime-local"
            value={form.onceAt}
            onChange={(e) => update("onceAt", e.target.value)}
          />
        ) : (
          <Input
            label={ui.habits.fieldTime}
            type="time"
            value={`${String(form.hour).padStart(2, "0")}:${String(form.minute).padStart(2, "0")}`}
            onChange={(e) => {
              const [hour, minute] = e.target.value.split(":").map(Number);
              update("hour", hour ?? 9);
              update("minute", minute ?? 0);
            }}
          />
        )}

        {form.frequency !== "once" && (
        <Input
          label={ui.habits.fieldStartDate}
          type="date"
          value={form.startDate}
          onChange={(e) => update("startDate", e.target.value)}
        />
        )}

        {form.frequency !== "once" && (
        <div>
          <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
            {ui.habits.fieldEndCondition}
          </label>
          <select
            value={form.endType}
            onChange={(e) =>
              update("endType", e.target.value as AutomationFormState["endType"])
            }
            className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25"
          >
            <option value="never">{ui.habits.endNever}</option>
            <option value="until_date">{ui.habits.endUntilDate}</option>
            <option value="occurrence_count">{ui.habits.endOccurrences}</option>
          </select>
        </div>
        )}

        {form.frequency !== "once" && form.endType === "until_date" && (
          <Input
            label={ui.habits.fieldEndDate}
            type="date"
            value={form.endDate}
            onChange={(e) => update("endDate", e.target.value)}
          />
        )}

        {form.frequency !== "once" && form.endType === "occurrence_count" && (
          <Input
            label={ui.habits.fieldMaxOccurrences}
            type="number"
            min={1}
            value={form.maxOccurrences}
            onChange={(e) =>
              update("maxOccurrences", Number.parseInt(e.target.value, 10) || 1)
            }
          />
        )}
      </div>

      <Textarea
        label={ui.habits.fieldAssignment}
        value={form.assignment}
        onChange={(e) => update("assignment", e.target.value)}
        rows={4}
        placeholder="AI秘書に任せる具体的な依頼内容"
      />

      <ExecutionFlowEditor
        value={form.executionFlow}
        onChange={(flow) => update("executionFlow", flow)}
      />

      <ExecutionLevelSelector
        value={form.executionLevel}
        onChange={(level) => update("executionLevel", level)}
      />

      <ExecutionModeSelector
        value={form.executionMode}
        onChange={(mode) => update("executionMode", mode)}
      />

      {form.executionFlow.templateId === "sns_post" && form.executionMode === "eco" && (
        <SnsBatchSelector
          value={form.snsBatchDays}
          onChange={(days) => update("snsBatchDays", days)}
        />
      )}

      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.habits.schedulePreview}: {buildScheduleLabel(form)}
      </p>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={!form.title.trim() || !form.assignment.trim()}
          isLoading={isSaving}
        >
          {ui.habits.registerAction}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {ui.actions.cancel}
        </Button>
      </div>
    </Card>
  );
}
