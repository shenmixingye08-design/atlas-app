"use client";

import { useState } from "react";

import type { AutomationExecutionLevel } from "@/lib/automations/types";
import { EXECUTION_LEVEL_OPTIONS } from "@/lib/automations/execution-level";
import {
  deleteManualOverride,
  getAllSuggestions,
  getApprovalRequiredJobs,
  getFullAutoJobs,
  getJobCategoryLabel,
  getTopFrequentJobs,
  resetUserWorkProfile,
  saveManualOverride,
  type JobCategoryId,
  type ManualPreferenceEntry,
} from "@/lib/user-profile";
import { useWorkProfile } from "@/lib/user-profile/use-work-profile";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

const JOB_CATEGORIES: JobCategoryId[] = [
  "sales_material",
  "blog",
  "sns_post",
  "video",
  "email",
  "file_organize",
  "generic",
];

type EditState = {
  id?: string;
  jobCategory: JobCategoryId;
  summary: string;
  executionLevel: AutomationExecutionLevel;
  preferredHour: string;
  preferredMinute: string;
};

export function WorkProfileSettings() {
  const { profile, refresh, reset } = useWorkProfile();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);

  const frequent = getTopFrequentJobs(profile, 8);
  const suggestions = getAllSuggestions(profile);
  const approvalJobs = getApprovalRequiredJobs(profile);
  const autoJobs = getFullAutoJobs(profile);

  const handleReset = () => {
    if (!window.confirm(ui.workProfile.resetConfirm)) return;
    reset();
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    deleteManualOverride(id);
    refresh();
  };

  const startEdit = (entry?: ManualPreferenceEntry) => {
    setEditing({
      id: entry?.id,
      jobCategory: entry?.jobCategory ?? "generic",
      summary: entry?.summary ?? "",
      executionLevel: entry?.executionLevel ?? "approve_then_run",
      preferredHour:
        entry?.preferredHour !== undefined ? String(entry.preferredHour) : "",
      preferredMinute:
        entry?.preferredMinute !== undefined ? String(entry.preferredMinute) : "",
    });
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    setError(null);

    try {
      saveManualOverride({
        id: editing.id,
        jobCategory: editing.jobCategory,
        label: getJobCategoryLabel(editing.jobCategory),
        summary:
          editing.summary.trim() ||
          ui.workProfile.defaultSummary(editing.jobCategory),
        executionLevel: editing.executionLevel,
        preferredHour: editing.preferredHour
          ? Number.parseInt(editing.preferredHour, 10)
          : undefined,
        preferredMinute: editing.preferredMinute
          ? Number.parseInt(editing.preferredMinute, 10)
          : undefined,
      });
      refresh();
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    }
  };

  return (
    <div className="space-y-10">
      {error && <ErrorState message={error} />}

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <h2 className="text-title text-foreground">{ui.workProfile.frequentJobsTitle}</h2>
        {frequent.length === 0 ? (
          <p className="mt-3 text-body text-[var(--foreground-muted)]">
            {ui.workProfile.noDataYet}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {frequent.map((job) => (
              <li
                key={job.jobCategory}
                className="flex items-center justify-between rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 py-3 text-sm"
              >
                <span className="font-medium text-foreground">{job.label}</span>
                <span className="text-[var(--foreground-muted)]">
                  {ui.workProfile.usageCount(job.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-title text-foreground">{ui.workProfile.learnedListTitle}</h2>
          <Button variant="secondary" size="sm" onClick={() => startEdit()}>
            {ui.workProfile.addOverride}
          </Button>
        </div>

        {suggestions.length === 0 ? (
          <p className="mt-3 text-body text-[var(--foreground-muted)]">
            {ui.workProfile.noDataYet}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border-subtle)]">
            {suggestions.map((item) => {
              const override = profile.manualOverrides.find(
                (entry) => entry.jobCategory === item.jobCategory,
              );
              return (
                <li
                  key={item.jobCategory}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {item.summary}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => startEdit(override)}
                    >
                      {ui.actions.update}
                    </Button>
                    {override && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDelete(override.id)}
                      >
                        {ui.actions.delete}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card padding="lg" className="shadow-[var(--shadow-soft)]">
          <h3 className="font-semibold text-foreground">
            {ui.workProfile.approvalJobsTitle}
          </h3>
          <ul className="mt-3 space-y-1 text-sm text-[var(--foreground-muted)]">
            {approvalJobs.length === 0 ? (
              <li>{ui.workProfile.noDataYet}</li>
            ) : (
              approvalJobs.map((category) => (
                <li key={category}>{getJobCategoryLabel(category)}</li>
              ))
            )}
          </ul>
        </Card>

        <Card padding="lg" className="shadow-[var(--shadow-soft)]">
          <h3 className="font-semibold text-foreground">
            {ui.workProfile.fullAutoJobsTitle}
          </h3>
          <ul className="mt-3 space-y-1 text-sm text-[var(--foreground-muted)]">
            {autoJobs.length === 0 ? (
              <li>{ui.workProfile.noDataYet}</li>
            ) : (
              autoJobs.map((category) => (
                <li key={category}>{getJobCategoryLabel(category)}</li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {editing && (
        <Card padding="lg" className="shadow-[var(--shadow-soft)]">
          <h3 className="text-title text-foreground">{ui.workProfile.editTitle}</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
                {ui.workProfile.jobTypeLabel}
              </label>
              <select
                value={editing.jobCategory}
                onChange={(event) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          jobCategory: event.target.value as JobCategoryId,
                        }
                      : prev,
                  )
                }
                className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base"
              >
                {JOB_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {getJobCategoryLabel(category)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
                {ui.requestScope.fieldLabel}
              </label>
              <select
                value={editing.executionLevel}
                onChange={(event) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          executionLevel: event.target
                            .value as AutomationExecutionLevel,
                        }
                      : prev,
                  )
                }
                className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base"
              >
                {EXECUTION_LEVEL_OPTIONS.map((option) => (
                  <option key={option.level} value={option.level}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
                {ui.workProfile.summaryLabel}
              </label>
              <input
                value={editing.summary}
                onChange={(event) =>
                  setEditing((prev) =>
                    prev ? { ...prev, summary: event.target.value } : prev,
                  )
                }
                placeholder={ui.workProfile.summaryPlaceholder}
                className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
                  {ui.workProfile.hourLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={editing.preferredHour}
                  onChange={(event) =>
                    setEditing((prev) =>
                      prev ? { ...prev, preferredHour: event.target.value } : prev,
                    )
                  }
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
                  {ui.workProfile.minuteLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={editing.preferredMinute}
                  onChange={(event) =>
                    setEditing((prev) =>
                      prev
                        ? { ...prev, preferredMinute: event.target.value }
                        : prev,
                    )
                  }
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" onClick={handleSaveEdit}>
              {ui.actions.save}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {ui.actions.cancel}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" onClick={handleReset}>
          {ui.workProfile.resetAll}
        </Button>
      </div>
    </div>
  );
}
