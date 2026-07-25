"use client";

import { useState } from "react";

import type { Automation, AutomationExecutionLevel } from "@/lib/automations/types";
import {
  formatAutomationDateTime,
  updateAutomation,
} from "@/lib/automations/client";
import {
  CONFIRMATION_SCOPE_OPTIONS,
  ENTRUSTED_JOB_STATUS_LABELS,
  clampConfirmationLevel,
  describeMaterialsAndMemory,
  describeProcedure,
  flowHasCriticalExternalActions,
  formatAutomationSuccessRate,
  getConfirmationScopeLabel,
  resolveEntrustedJobStatus,
  resolveScheduleMethod,
} from "@/lib/automations/display";
import { formatNextRunDisplay } from "@/lib/automations/form-utils";
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
  isRunning: boolean;
  isUpdating: boolean;
};

export function AutomationDetailPanel({
  automation,
  onClose,
  onUpdated,
  onRunNow,
  onToggleEnabled,
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

  const status = resolveEntrustedJobStatus(automation);
  const schedule = resolveScheduleMethod(automation.schedule);
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
    setSavingEdit(true);
    try {
      const updated = await updateAutomation(automation.id, {
        name: name.trim(),
        description: description.trim(),
        workflow: {
          ...automation.workflow,
          assignment: assignment.trim(),
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
                  status === "running"
                    ? "running"
                    : status === "completed"
                      ? "completed"
                      : status === "error"
                        ? "error"
                        : status === "paused"
                          ? "waiting"
                          : "info"
                }
                label={ENTRUSTED_JOB_STATUS_LABELS[status]}
              />
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {ui.actions.close}
          </Button>
        </div>

        <div className="mt-8 space-y-7">
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

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs text-[var(--text-muted)]">
                {ui.entrustedJobs.materials}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {describeMaterialsAndMemory(automation)}
              </p>
            </div>
            <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs text-[var(--text-muted)]">
                {ui.entrustedJobs.workMemory}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {ui.entrustedJobs.workMemoryHint}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.entrustedJobs.conditions}
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {schedule.supported ? schedule.label : ui.entrustedJobs.comingSoon}
              {" · "}
              {ui.entrustedJobs.nextRun}:{" "}
              {automation.enabled
                ? formatAutomationDateTime(automation.nextRun)
                : "—"}
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
              {CONFIRMATION_SCOPE_OPTIONS.map((option) => {
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
              {getConfirmationScopeLabel(automation.executionLevel)}
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
            {isXDestination && (
              <p className="text-xs text-[var(--text-secondary)]">
                投稿先: X / 仕事ID: {automation.id}
              </p>
            )}
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2">
                <dt className="text-xs text-[var(--text-muted)]">
                  {ui.entrustedJobs.lastRun}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {formatAutomationDateTime(automation.lastRun)}
                </dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2">
                <dt className="text-xs text-[var(--text-muted)]">
                  {ui.entrustedJobs.nextRun}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {automation.enabled
                    ? formatNextRunDisplay(automation.nextRun)
                    : "—"}
                </dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2">
                <dt className="text-xs text-[var(--text-muted)]">
                  {ui.entrustedJobs.failureCount}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {automation.failureCount ?? 0}
                </dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2">
                <dt className="text-xs text-[var(--text-muted)]">
                  {ui.entrustedJobs.successRate}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {formatAutomationSuccessRate(automation)}
                </dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 sm:col-span-2">
                <dt className="text-xs text-[var(--text-muted)]">
                  {ui.entrustedJobs.statusLabel}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {ENTRUSTED_JOB_STATUS_LABELS[status]}
                  {!automation.enabled ? " / OFF" : " / ON"}
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
                    {entry.status === "completed" && entry.xPostUrl ? (
                      <>
                        <p className="font-medium text-foreground">
                          Xへの投稿が完了しました
                        </p>
                        <p>投稿日時: {formatNextRunDisplay(entry.completedAt)}</p>
                        {entry.generatedText ? (
                          <p className="whitespace-pre-wrap">
                            投稿内容: {entry.generatedText}
                          </p>
                        ) : null}
                        <a
                          href={entry.xPostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline-offset-2 hover:underline"
                        >
                          Xで投稿を見る
                        </a>
                      </>
                    ) : entry.status === "failed" ? (
                      <>
                        <p className="font-medium text-foreground">
                          Xへの投稿に失敗しました
                        </p>
                        <p>原因: {entry.error ?? "不明なエラー"}</p>
                        <p>
                          対応:{" "}
                          {entry.errorCode === "x_not_connected" ||
                          entry.errorCode === "x_reconnect_required" ||
                          entry.errorCode === "x_missing_access_token"
                            ? "外部連携画面からXを再連携してください"
                            : "実行内容と外部連携設定をご確認ください"}
                        </p>
                      </>
                    ) : entry.status === "awaiting_approval" ? (
                      <>
                        <p className="font-medium text-foreground">
                          投稿前の確認待ちです
                        </p>
                        <p>予定日時: {formatNextRunDisplay(entry.scheduledAt)}</p>
                        {entry.generatedText ? (
                          <p className="whitespace-pre-wrap">
                            投稿予定文章: {entry.generatedText}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {formatAutomationDateTime(entry.completedAt)} — 成功
                        {entry.error ? `（${entry.error}）` : ""}
                      </>
                    )}
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
                {automation.lastError}
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
                <span className="text-[var(--text-secondary)]">
                  {ui.habits.fieldAssignment}
                </span>
                <textarea
                  value={assignment}
                  onChange={(e) => setAssignment(e.target.value)}
                  rows={4}
                  className="w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground"
                />
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
            disabled
            title={ui.entrustedJobs.deleteComingSoon}
          >
            {ui.entrustedJobs.delete}（{ui.entrustedJobs.comingSoon}）
          </Button>
        </div>
      </Card>
    </div>
  );
}
