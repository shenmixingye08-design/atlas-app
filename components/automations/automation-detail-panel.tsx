"use client";

import { useState } from "react";

import type { Automation, AutomationExecutionLevel } from "@/lib/automations/types";
import { updateAutomation } from "@/lib/automations/client";
import { patchAutomationSchedule } from "@/lib/automations/schedule";
import {
  clampConfirmationLevel,
  describeProcedure,
  flowHasCriticalExternalActions,
} from "@/lib/automations/display";
import {
  AUTOMATION_USER_STATUS_LABEL,
  buildAutomationPreview,
  describeApprovalMethod,
  explainAutomationFailure,
  formatDeleteConfirm,
  formatFirstSuccessCopy,
  formatHistoryStatus,
  formatUserDateTime,
  formatUserNextRun,
  resolveAutomationUserStatus,
} from "@/lib/automations/ux";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

import { PendingXApprovalPanel } from "./pending-x-approval-panel";

type AutomationDetailPanelProps = {
  automation: Automation;
  onClose: () => void;
  onUpdated: (automation: Automation) => void;
  onRunNow: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onDelete?: (id: string) => void | Promise<void>;
  isRunning: boolean;
  isUpdating: boolean;
};

export function AutomationDetailPanel({
  automation,
  onClose,
  onUpdated,
  onRunNow,
  onToggleEnabled,
  onDelete,
  isRunning,
  isUpdating,
}: AutomationDetailPanelProps) {
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(automation.name);
  const [description, setDescription] = useState(automation.description);
  const [assignment, setAssignment] = useState(automation.workflow.assignment);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hourInput, setHourInput] = useState(() => {
    if (automation.schedule.kind !== "schedule") return "09:00";
    const { hour, minute } = automation.schedule.preset;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  });
  const [frequencyInput, setFrequencyInput] = useState(() => {
    if (automation.schedule.kind !== "schedule") return "daily";
    const preset = automation.schedule.preset;
    if (preset.type === "daily" && preset.weekdays?.length === 5) return "weekdays";
    return preset.type;
  });
  const [weekdayInput, setWeekdayInput] = useState(() =>
    automation.schedule.kind === "schedule" &&
    automation.schedule.preset.type === "weekly"
      ? String(automation.schedule.preset.dayOfWeek)
      : "1",
  );
  const [lengthOverride, setLengthOverride] = useState("");
  const [emojiOverride, setEmojiOverride] = useState("");
  const [hashtagOverride, setHashtagOverride] = useState("");

  const status = resolveAutomationUserStatus(automation);
  const preview = buildAutomationPreview(automation);
  const isXDestination = automation.destination === "x";
  const critical =
    !isXDestination && flowHasCriticalExternalActions(automation.executionFlow);
  const procedure = describeProcedure(automation);

  const handleLevelChange = async (level: AutomationExecutionLevel) => {
    setSavingLevel(true);
    setLevelError(null);
    try {
      const nextLevel = clampConfirmationLevel(level, automation.executionFlow, {
        destination: automation.destination,
      });
      if (level === "full_auto" && nextLevel !== "full_auto") {
        setLevelError(ui.entrustedJobs.criticalRequiresConfirm);
      }
      const updated = await updateAutomation(automation.id, {
        executionLevel: nextLevel,
      });
      onUpdated(updated);
    } catch (err) {
      setLevelError(
        err instanceof Error ? err.message : ui.error.updateFailed,
      );
    } finally {
      setSavingLevel(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!name.trim() || !assignment.trim()) return;
    const [hourText, minuteText] = hourInput.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText ?? "0");
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      setLevelError("時刻を正しく入力してください。");
      return;
    }
    setSavingEdit(true);
    try {
      const override: Record<string, string | number> = {};
      if (lengthOverride === "short" || lengthOverride === "long") {
        override.length = lengthOverride;
      }
      if (emojiOverride === "none" || emojiOverride === "few") {
        override.emoji = emojiOverride;
      }
      if (hashtagOverride === "none") {
        override.hashtags = "none";
        override.hashtagsMax = 0;
      } else if (hashtagOverride === "2") {
        override.hashtags = "limited";
        override.hashtagsMax = 2;
      }
      const previousSnapshot =
        automation.workflow.metadata?.memorySnapshot &&
        typeof automation.workflow.metadata.memorySnapshot === "object"
          ? (automation.workflow.metadata.memorySnapshot as Record<string, unknown>)
          : {};
      const updated = await updateAutomation(automation.id, {
        name: name.trim(),
        description: description.trim(),
        schedule: patchAutomationSchedule(automation.schedule, {
          hour,
          minute: Number.isInteger(minute) ? minute : 0,
          frequency:
            frequencyInput === "weekdays" ||
            frequencyInput === "daily" ||
            frequencyInput === "weekly" ||
            frequencyInput === "monthly"
              ? frequencyInput
              : undefined,
          dayOfWeek:
            frequencyInput === "weekly" ? Number(weekdayInput) : undefined,
          weekdays: frequencyInput === "weekdays" ? [1, 2, 3, 4, 5] : undefined,
        }),
        workflow: {
          ...automation.workflow,
          assignment: assignment.trim(),
          metadata: {
            ...(automation.workflow.metadata ?? {}),
            ...(Object.keys(override).length > 0
              ? {
                  memoryOverrides: {
                    ...((automation.workflow.metadata?.memoryOverrides as
                      | Record<string, unknown>
                      | undefined) ?? {}),
                    ...override,
                  },
                  memorySnapshot: {
                    ...previousSnapshot,
                    overriddenPreferences: override,
                    source: "automation_override",
                  },
                }
              : {}),
          },
        },
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setLevelError(
        err instanceof Error ? err.message : ui.error.updateFailed,
      );
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        aria-label={ui.actions.close}
        onClick={onClose}
      />
      <Card
        padding="lg"
        className="relative z-10 max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-lg)] sm:mx-4 sm:rounded-[var(--radius-2xl)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entrusted-job-detail-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-accent">{ui.brand}</p>
            <h2
              id="entrusted-job-detail-title"
              className="mt-1 text-title text-foreground"
            >
              {automation.name}
            </h2>
            <div className="mt-2">
              <StatusChip
                status={
                  status === "waiting"
                    ? "running"
                    : status === "failed" || status === "needs_attention"
                      ? "error"
                      : status === "awaiting_approval" || status === "retrying"
                        ? "warning"
                        : status === "paused"
                          ? "waiting"
                          : "info"
                }
                label={AUTOMATION_USER_STATUS_LABEL[status]}
              />
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {ui.actions.close}
          </Button>
        </div>

        <div className="mt-8 space-y-7">
          <section className="space-y-2 rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">自動化内容</h3>
            <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
              <li>{preview.action}</li>
              <li>{preview.frequency}</li>
              <li>次回：{preview.nextRunLabel}</li>
              <li>実行方法：{preview.approvalLabel}</li>
              {preview.memoryLabels.length > 0 ? (
                <li>
                  あなたの好みを反映：{preview.memoryLabels.join("、")}
                </li>
              ) : null}
              {preview.overrideLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </section>

          {formatFirstSuccessCopy(automation) ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {formatFirstSuccessCopy(automation)}
            </p>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.entrustedJobs.purpose}
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {automation.description || automation.workflow.assignment}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.entrustedJobs.procedure}
            </h3>
            <ol className="space-y-2">
              {procedure.map((step, index) => (
                <li
                  key={`${step}-${index}`}
                  className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                >
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.entrustedJobs.requiredInput}
            </h3>
            <p className="whitespace-pre-wrap rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-3 text-sm text-[var(--text-secondary)]">
              {automation.workflow.assignment}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.entrustedJobs.conditions}
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {preview.frequency} · 次回：{preview.nextRunLabel}
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.entrustedJobs.confirmationScope}
            </h3>
            {critical && (
              <p className="text-xs text-[var(--text-secondary)]">
                {ui.entrustedJobs.criticalNotice}
              </p>
            )}
            <div className="space-y-2" role="radiogroup">
              {([
                { level: "approve_then_run" as const, ...describeApprovalMethod("approve_then_run") },
                { level: "full_auto" as const, ...describeApprovalMethod("full_auto") },
              ]).map((option) => {
                const disabled =
                  savingLevel ||
                  (option.level === "full_auto" && critical);
                const selected = automation.executionLevel === option.level;
                return (
                  <label
                    key={option.level}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[var(--radius-xl)] px-4 py-3 transition-colors",
                      selected
                        ? "bg-[var(--accent-muted)]"
                        : "hover:bg-[var(--surface-muted)]",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="confirmation-scope"
                      className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => void handleLevelChange(option.level)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                        {option.hint}
                        {option.level === "full_auto" && critical
                          ? `（${ui.entrustedJobs.comingSoon}不可）`
                          : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {ui.entrustedJobs.currentConfirmation}:{" "}
              {describeApprovalMethod(automation.executionLevel).label}
            </p>
            {levelError && (
              <p className="text-sm text-[var(--error)]" role="alert">
                {levelError}
              </p>
            )}
          </section>

          {isXDestination && (
            <PendingXApprovalPanel automationId={automation.id} />
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.entrustedJobs.runHistory}
            </h3>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2">
                <dt className="text-xs text-[var(--text-muted)]">前回</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {automation.lastRun
                    ? formatUserDateTime(automation.lastRun)
                    : "まだありません"}
                </dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2">
                <dt className="text-xs text-[var(--text-muted)]">次回</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {preview.nextRunLabel}
                </dd>
              </div>
            </dl>
            <ul className="space-y-3">
              {(automation.runHistory ?? []).length === 0 ? (
                <li className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]">
                  まだ実行履歴はありません
                </li>
              ) : (
                (automation.runHistory ?? []).slice(0, 8).map((entry) => (
                  <li
                    key={entry.id}
                    id={`execution-${entry.id}`}
                    className="space-y-2 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-3 text-sm text-[var(--text-secondary)]"
                  >
                    {(() => {
                      const history = formatHistoryStatus(entry);
                      return (
                        <>
                          <p className="font-medium text-foreground">
                            {formatUserDateTime(
                              entry.completedAt || entry.startedAt,
                            )}{" "}
                            · {history.label}
                          </p>
                          <p>{history.detail}</p>
                          {entry.generatedText ? (
                            <p className="whitespace-pre-wrap">
                              内容: {entry.generatedText}
                            </p>
                          ) : null}
                          {entry.xPostUrl ? (
                            <a
                              href={entry.xPostUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent underline-offset-2 hover:underline"
                            >
                              投稿を見る
                            </a>
                          ) : null}
                        </>
                      );
                    })()}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.entrustedJobs.errorHistory}
            </h3>
            {automation.lastError ? (
              <p className="rounded-[var(--radius-lg)] border border-[var(--status-error)]/20 bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error)]">
                {explainAutomationFailure(
                  automation.lastError,
                  automation.runHistory?.[0]?.errorCode,
                ).title}
                。
                {
                  explainAutomationFailure(
                    automation.lastError,
                    automation.runHistory?.[0]?.errorCode,
                  ).body
                }
              </p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                {ui.entrustedJobs.noErrors}
              </p>
            )}
          </section>

          {editing && (
            <section className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {ui.entrustedJobs.edit}
              </h3>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">
                  {ui.habits.fieldTitle}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 text-foreground"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">
                  {ui.entrustedJobs.purpose}
                </span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 text-foreground"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">時刻</span>
                <input
                  type="time"
                  value={hourInput}
                  onChange={(e) => setHourInput(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 text-foreground"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">頻度</span>
                <select
                  value={frequencyInput}
                  onChange={(e) => setFrequencyInput(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 text-foreground"
                >
                  <option value="daily">毎日</option>
                  <option value="weekdays">平日</option>
                  <option value="weekly">毎週</option>
                  <option value="monthly">毎月</option>
                </select>
              </label>
              {frequencyInput === "weekly" ? (
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--text-secondary)]">曜日</span>
                  <select
                    value={weekdayInput}
                    onChange={(e) => setWeekdayInput(e.target.value)}
                    className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 text-foreground"
                  >
                    {["日", "月", "火", "水", "木", "金", "土"].map(
                      (label, index) => (
                        <option key={label} value={String(index)}>
                          {label}曜日
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ) : null}
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">
                  {ui.habits.fieldAssignment}
                </span>
                <textarea
                  value={assignment}
                  onChange={(e) => setAssignment(e.target.value)}
                  rows={4}
                  className="min-h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground"
                />
              </label>
              <p className="text-xs text-[var(--text-muted)]">
                この自動化だけ変える（覚えている好みはそのまま）
              </p>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">文章</span>
                <select
                  value={lengthOverride}
                  onChange={(e) => setLengthOverride(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 text-foreground"
                >
                  <option value="">覚えている好みのまま</option>
                  <option value="short">この自動化では短め</option>
                  <option value="long">この自動化では長め</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">絵文字</span>
                <select
                  value={emojiOverride}
                  onChange={(e) => setEmojiOverride(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 text-foreground"
                >
                  <option value="">覚えている好みのまま</option>
                  <option value="few">この自動化では少なめ</option>
                  <option value="none">この自動化ではなし</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">ハッシュタグ</span>
                <select
                  value={hashtagOverride}
                  onChange={(e) => setHashtagOverride(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 text-foreground"
                >
                  <option value="">覚えている好みのまま</option>
                  <option value="2">この自動化では最大2個</option>
                  <option value="none">この自動化ではなし</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={savingEdit}
                  onClick={() => void handleSaveEdit()}
                >
                  {ui.actions.save}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  {ui.actions.cancel}
                </Button>
              </div>
            </section>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-5">
          <Button
            variant="primary"
            size="sm"
            className="min-h-[48px]"
            disabled={isRunning || isUpdating}
            isLoading={isRunning}
            onClick={() => onRunNow(automation.id)}
          >
            {ui.entrustedJobs.runNow}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[48px]"
            onClick={() => setEditing(true)}
          >
            {ui.entrustedJobs.edit}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[48px]"
            disabled={isUpdating}
            onClick={() =>
              onToggleEnabled(automation.id, !automation.enabled)
            }
          >
            {automation.enabled
              ? ui.entrustedJobs.pause
              : ui.entrustedJobs.resume}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[48px]"
            disabled={isUpdating || deleting || !onDelete}
            title={ui.entrustedJobs.deleteSemanticsHint}
            isLoading={deleting}
            onClick={() => {
              if (!onDelete) return;
              if (!window.confirm(formatDeleteConfirm(automation))) return;
              setDeleting(true);
              void Promise.resolve(onDelete(automation.id)).finally(() =>
                setDeleting(false),
              );
            }}
          >
            {ui.entrustedJobs.delete}
          </Button>
        </div>
      </Card>
    </div>
  );
}
