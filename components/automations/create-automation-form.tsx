"use client";

import { useEffect, useMemo, useState } from "react";

import type { AutomationFormState } from "@/lib/automations/form-utils";
import {
  WEEKDAY_LABELS,
  buildCreateInputFromForm,
  buildScheduleLabel,
  defaultAutomationFormState,
  formatNextRunDisplay,
  syncExecutionFlowFromJobText,
} from "@/lib/automations/form-utils";
import { createAutomation } from "@/lib/automations/client";
import { computeNextRunIso } from "@/lib/automations/schedule";
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
import {
  createXPostClient,
  fetchXConnectionStatusClient,
} from "@/lib/integrations/x/post/client";
import type { XConnectionCheckResult } from "@/lib/integrations/x/connection-types";
import { buildXDestinationExecutionFlow } from "@/lib/automations/x-recurring/destination";

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
  const [xStatus, setXStatus] = useState<XConnectionCheckResult | null>(null);
  const [xStatusError, setXStatusError] = useState<string | null>(null);
  const [testingPost, setTestingPost] = useState(false);
  const [testConfirmOpen, setTestConfirmOpen] = useState(false);
  const [testResult, setTestResult] = useState<{
    tweetId: string;
    tweetUrl: string;
    postedAt: string;
  } | null>(null);
  const [savedNextRun, setSavedNextRun] = useState<string | null>(null);

  const suggestion = useMemo(
    () => getSuggestionForText(`${form.title} ${form.assignment}`),
    [form.title, form.assignment],
  );

  const previewNextRun = useMemo(() => {
    try {
      return computeNextRunIso(buildCreateInputFromForm(form).schedule);
    } catch {
      return null;
    }
  }, [form]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setForm((prev) => applyWorkProfileToFormState(prev));
      setProfileApplied(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (form.destination !== "x") return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchXConnectionStatusClient();
        if (cancelled) return;
        setXStatus(status);
        setXStatusError(null);
      } catch (err) {
        if (cancelled) return;
        setXStatus(null);
        setXStatusError(
          err instanceof Error
            ? err.message
            : "X連携状態の確認に失敗しました",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.destination]);

  const update = <K extends keyof AutomationFormState>(
    key: K,
    value: AutomationFormState[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "destination") {
        if (value === "x") {
          next.executionFlow = buildXDestinationExecutionFlow(next.executionLevel);
          if (!next.assignment.trim()) {
            next.assignment =
              "X（Twitter）へ投稿する文章を作成し、実際に投稿してください。";
          }
        }
        return next;
      }
      if (key === "executionLevel" && next.destination === "x") {
        next.executionFlow = buildXDestinationExecutionFlow(
          value as AutomationFormState["executionLevel"],
        );
        return next;
      }
      if (key === "title" || key === "assignment") {
        return syncExecutionFlowFromJobText(next);
      }
      return next;
    });
  };

  const xReady =
    form.destination !== "x" ||
    (xStatus?.status === "ready" &&
      xStatus.connected &&
      xStatus.permissionsOk !== false);

  const xBlockMessage = (() => {
    if (form.destination !== "x") return null;
    if (xStatusError) return xStatusError;
    if (!xStatus) return "X連携状態を確認しています…";
    if (xStatus.status === "disconnected") {
      return "Xが連携されていません。外部連携画面からXを連携してください。";
    }
    if (
      xStatus.status === "reconnect_required" ||
      xStatus.status === "error" ||
      xStatus.status === "feature_disabled"
    ) {
      return "Xとの再連携が必要です。";
    }
    if (xStatus.status === "ready" && xStatus.permissionsOk === false) {
      return "Xとの再連携が必要です。";
    }
    if (xStatus.status !== "ready" || !xStatus.connected) {
      return "Xが連携されていません。外部連携画面からXを連携してください。";
    }
    return null;
  })();

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.assignment.trim()) return;
    if (form.destination === "x" && !xReady) {
      setError(
        xBlockMessage ??
          "Xが連携されていません。外部連携画面からXを連携してください。",
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const input = buildCreateInputFromForm(form);
      const created = await createAutomation(input);
      recordAutomationCreated(input);
      setSavedNextRun(created.nextRun);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPost = async () => {
    setTestingPost(true);
    setError(null);
    try {
      const result = await createXPostClient({
        text: "",
        mode: "test",
      });
      if (result.status !== "ready" || result.history?.status !== "success") {
        const message =
          result.status === "ready"
            ? result.history?.errorMessage ?? "テスト投稿に失敗しました"
            : result.message;
        setError(message);
        setTestResult(null);
        return;
      }
      setTestResult({
        tweetId: result.history.tweetId ?? "",
        tweetUrl: result.history.tweetUrl ?? "",
        postedAt: result.history.postedAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "テスト投稿に失敗しました");
    } finally {
      setTestingPost(false);
      setTestConfirmOpen(false);
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
          placeholder="例: 毎日のX投稿"
        />

        <div>
          <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
            投稿先
          </label>
          <select
            value={form.destination}
            onChange={(e) =>
              update(
                "destination",
                e.target.value as AutomationFormState["destination"],
              )
            }
            className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25"
          >
            <option value="none">なし（成果物のみ）</option>
            <option value="x">X</option>
          </select>
        </div>

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
            <option value="weekday">曜日指定</option>
            <option value="custom">カスタム</option>
          </select>
        </div>

        {(form.frequency === "weekly" || form.frequency === "weekday") && (
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

        {form.frequency === "custom" && (
          <Input
            label="カスタムCron"
            value={form.customCron}
            onChange={(e) => update("customCron", e.target.value)}
            placeholder="分 時 日 月 曜日"
          />
        )}

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

        <div>
          <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
            タイムゾーン
          </label>
          <select
            value={form.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25"
          >
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        <Input
          label={ui.habits.fieldStartDate}
          type="date"
          value={form.startDate}
          onChange={(e) => update("startDate", e.target.value)}
        />

        <div>
          <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
            有効・停止
          </label>
          <select
            value={form.enabled ? "enabled" : "disabled"}
            onChange={(e) => update("enabled", e.target.value === "enabled")}
            className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25"
          >
            <option value="enabled">有効</option>
            <option value="disabled">停止</option>
          </select>
        </div>

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

        {form.endType === "until_date" && (
          <Input
            label={ui.habits.fieldEndDate}
            type="date"
            value={form.endDate}
            onChange={(e) => update("endDate", e.target.value)}
          />
        )}

        {form.endType === "occurrence_count" && (
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
        label="実行内容"
        value={form.assignment}
        onChange={(e) => update("assignment", e.target.value)}
        rows={4}
        placeholder="AI秘書に任せる具体的な依頼内容"
      />

      {form.destination === "x" && (
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 px-4 py-3">
          <p className="text-sm font-medium text-foreground">X連携状態</p>
          {xBlockMessage ? (
            <p className="text-sm text-[var(--error)]" role="alert">
              {xBlockMessage}
            </p>
          ) : (
            <p className="text-sm text-foreground">
              投稿可能な状態です
              {xStatus && "account" in xStatus && xStatus.account?.username
                ? `（@${xStatus.account.username}）`
                : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              type="button"
              disabled={!xReady || testingPost}
              onClick={() => setTestConfirmOpen(true)}
            >
              今すぐテスト投稿
            </Button>
            <a
              href="/settings/x"
              className="inline-flex min-h-[40px] items-center text-sm text-accent underline-offset-2 hover:underline"
            >
              外部連携画面を開く
            </a>
          </div>
          {testConfirmOpen && (
            <div className="space-y-3 rounded-[var(--radius-lg)] border border-accent/30 bg-[var(--card)] px-4 py-3">
              <p className="text-sm text-foreground">
                連携中のXアカウントへ実際に投稿します。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  isLoading={testingPost}
                  onClick={() => void handleTestPost()}
                >
                  投稿する
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setTestConfirmOpen(false)}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          )}
          {testResult && (
            <div className="space-y-1 text-sm text-foreground">
              <p>テスト投稿が完了しました</p>
              <p>投稿ID: {testResult.tweetId}</p>
              <p>投稿日時: {formatNextRunDisplay(testResult.postedAt)}</p>
              {testResult.tweetUrl ? (
                <a
                  href={testResult.tweetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Xで投稿を見る
                </a>
              ) : null}
            </div>
          )}
        </div>
      )}

      {form.destination !== "x" && (
        <ExecutionFlowEditor
          value={form.executionFlow}
          onChange={(flow) => update("executionFlow", flow)}
        />
      )}

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
      <p className="text-sm text-foreground">
        次回実行: {formatNextRunDisplay(savedNextRun ?? previewNextRun)}
      </p>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={
            !form.title.trim() ||
            !form.assignment.trim() ||
            (form.destination === "x" && !xReady)
          }
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
