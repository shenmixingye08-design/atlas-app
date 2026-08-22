"use client";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { connectExternalService } from "@/lib/integrations/external-services";
import { X_OAUTH_WORKSPACE_SETUP_RETURN } from "@/lib/integrations/x/oauth-return-to";
import {
  fetchXAutoPostStatusClient,
  formatXAutoPostDateTime,
  formatXAutoPostFrequency,
  formatXAutoPostMode,
  formatXAutoPostRunStatus,
  runXAutoPostTrialClient,
  saveXAutoPostSettingsClient,
  X_AUTOPOST_AUDIENCE_PRESETS,
  X_AUTOPOST_FREQUENCY_OPTIONS,
  X_AUTOPOST_PURPOSE_PRESETS,
  X_AUTOPOST_TONE_PRESETS,
  X_AUTOPOST_TYPE_LABELS,
  X_AUTOPOST_WEEKDAY_LABELS,
  type XAutoPostMemoryView,
  type XAutoPostQuotaView,
  type XAutoPostRun,
  type XAutoPostSettings,
} from "@/lib/integrations/x/post/autopost-client";
import {
  hasConfiguredAutoPost,
  resolveXAutoPostLifecycle,
  type XConnectionLifecycle,
} from "@/lib/integrations/x/post/autopost-lifecycle";
import type {
  XAutoPostFrequency,
  XAutoPostMode,
} from "@/lib/integrations/x/post/autopost-types";
import { isClarityFirstRun } from "@/lib/product-clarity/first-run";
import {
  DEFAULT_X_POST_TIME,
  FIRST_RUN_SAVED_NOTICE,
  JOB_REMEMBERED_NOTICE,
  MEMORY_APPLIED_BADGE,
  NEXT_TIME_NO_DETAIL_NOTICE,
  X_OAUTH_CONTINUE_CTA,
  X_TRIAL_CONFIRM_POST,
  X_TRIAL_CTA,
  X_TRIAL_SAVED_JOB_NOTICE,
} from "@/lib/product-focus/messaging";

const FIELD_CLASS =
  "min-h-[44px] h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";

type FormState = {
  enabled: boolean;
  mode: XAutoPostMode;
  purpose: string;
  themes: string[];
  audience: string;
  tone: string;
  frequency: XAutoPostFrequency;
  daysOfWeek: number[];
  postTimes: string[];
  includeHashtags: boolean;
};

function toFormState(settings: XAutoPostSettings): FormState {
  return {
    enabled: settings.enabled,
    mode: settings.mode,
    purpose: settings.purpose,
    themes: settings.themes,
    audience: settings.audience,
    tone: settings.tone,
    frequency: settings.frequency,
    daysOfWeek: settings.daysOfWeek,
    postTimes: settings.postTimes.length > 0 ? settings.postTimes : [DEFAULT_X_POST_TIME],
    includeHashtags: settings.includeHashtags,
  };
}

function StatusRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-[var(--foreground-muted)]">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function RunStatusBadge({ run }: { run: XAutoPostRun }) {
  const variant =
    run.status === "posted"
      ? "success"
      : run.status === "drafted"
        ? "accent"
        : run.status === "failed"
          ? "error"
          : "default";
  return <Badge variant={variant}>{formatXAutoPostRunStatus(run)}</Badge>;
}

function formatNextRunLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function quotaLabel(quota: XAutoPostQuotaView | null): string | null {
  if (!quota || quota.limit <= 0) return null;
  return `${quota.remaining} / ${quota.limit}`;
}

export function XAutoPostPanel() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTrialRunning, setIsTrialRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<XConnectionLifecycle>("disconnected");
  const [accountUsername, setAccountUsername] = useState<string | null>(null);
  const [nextScheduledFor, setNextScheduledFor] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<XAutoPostRun[]>([]);
  const [quota, setQuota] = useState<XAutoPostQuotaView | null>(null);
  const [memory, setMemory] = useState<XAutoPostMemoryView>({
    applied: false,
    labels: [],
    memoryFailed: false,
  });
  const [justSaved, setJustSaved] = useState(false);
  const [trialConfirmOpen, setTrialConfirmOpen] = useState(false);
  const [trialOverride, setTrialOverride] = useState("");
  const [trialResult, setTrialResult] = useState<{
    status: "posted" | "drafted";
    text: string;
    memoryApplied: boolean;
  } | null>(null);
  const [modeChosen, setModeChosen] = useState(false);

  const [form, setForm] = useState<FormState | null>(null);
  const [themeDraft, setThemeDraft] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const oauthConnected = searchParams.get("connected") === "x";
  const oauthError = searchParams.get("x_error") === "1";
  const onboarding = searchParams.get("onboarding") === "1";
  const oauthUsername = searchParams.get("username");
  const displayConnected = connected || oauthConnected;
  const displayConnectionStatus: XConnectionLifecycle = isConnecting
    ? "pending"
    : oauthConnected
      ? "connected"
      : connectionStatus;
  const displayUsername =
    accountUsername ??
    (oauthUsername ? oauthUsername.replace(/^@/, "") : null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchXAutoPostStatusClient();
      if (result.status === "feature_disabled") {
        setFeatureDisabled(true);
        return;
      }
      setForm(toFormState(result.settings));
      setConnected(result.connected);
      setConnectionStatus(result.connectionStatus);
      setAccountUsername(result.accountUsername);
      setNextScheduledFor(result.nextScheduledFor);
      setRecentRuns(result.recentRuns);
      setQuota(result.quota);
      setMemory(result.memory);
      if (hasConfiguredAutoPost(result.settings)) {
        setModeChosen(true);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "設定を取得できませんでした",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    return scheduleMountWork(() => {
      void load();
    });
  }, [load]);

  const frequencyOption = useMemo(
    () =>
      X_AUTOPOST_FREQUENCY_OPTIONS.find(
        (option) => option.id === form?.frequency,
      ) ?? X_AUTOPOST_FREQUENCY_OPTIONS[0],
    [form?.frequency],
  );

  const lastResult = recentRuns[0] ?? null;
  const firstRun = isClarityFirstRun() || onboarding || !hasConfiguredAutoPost(form ? {
    ...form,
    userId: "",
    timezone: "Asia/Tokyo",
    createdAt: justSaved ? "1" : "0",
    updatedAt: justSaved ? "1" : "0",
  } as XAutoPostSettings : null);
  const slimFirstRun = firstRun && !showAdvanced && !justSaved;

  const oauthNotice = oauthConnected
    ? "X連携が完了しました。テーマと時刻を設定してください。"
    : null;
  const oauthErrorMessage = oauthError
    ? "X連携が完了しませんでした。この画面からもう一度連携できます。"
    : null;

  const lifecycle = resolveXAutoPostLifecycle({
    connectionStatus: displayConnectionStatus,
    connecting: isConnecting,
    settings: form
      ? {
          userId: "",
          ...form,
          timezone: "Asia/Tokyo",
          createdAt: justSaved || modeChosen ? "1" : "0",
          updatedAt: justSaved || modeChosen ? "1" : "0",
        }
      : null,
    nextScheduledFor,
    lastRun: lastResult,
  });

  const update = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleAddTheme = () => {
    const value = themeDraft.trim();
    if (!value || !form) return;
    if (form.themes.includes(value) || form.themes.length >= 10) {
      setThemeDraft("");
      return;
    }
    update({ themes: [...form.themes, value] });
    setThemeDraft("");
  };

  const handleRemoveTheme = (theme: string) => {
    if (!form) return;
    update({ themes: form.themes.filter((item) => item !== theme) });
  };

  const handleToggleDay = (day: number) => {
    if (!form) return;
    const next = form.daysOfWeek.includes(day)
      ? form.daysOfWeek.filter((item) => item !== day)
      : [...form.daysOfWeek, day].sort();
    update({ daysOfWeek: next });
  };

  const handleTimeChange = (index: number, value: string) => {
    if (!form) return;
    const next = [...form.postTimes];
    next[index] = value;
    update({ postTimes: next });
  };

  const handleAddTime = () => {
    if (!form || form.postTimes.length >= 3) return;
    update({ postTimes: [...form.postTimes, "12:00"] });
  };

  const handleRemoveTime = (index: number) => {
    if (!form || form.postTimes.length <= 1) return;
    update({ postTimes: form.postTimes.filter((_, i) => i !== index) });
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectExternalService("x", {
        returnTo: X_OAUTH_WORKSPACE_SETUP_RETURN,
      });
    } catch (err) {
      setIsConnecting(false);
      setError(err instanceof Error ? err.message : "X連携を開始できませんでした");
    }
  };

  const persist = async (override?: Partial<FormState>) => {
    if (!form) return;
    if (!displayConnected) {
      setError("先にXを連携してください");
      return;
    }
    if (!modeChosen && slimFirstRun) {
      setError("投稿方法を選んでください");
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    const payload = { ...form, ...override };
    const themes =
      payload.themes.length > 0
        ? payload.themes
        : themeDraft.trim()
          ? [themeDraft.trim()]
          : payload.themes;
    try {
      const result = await saveXAutoPostSettingsClient({
        enabled: payload.enabled,
        mode: payload.mode,
        purpose: payload.purpose,
        themes,
        audience: payload.audience,
        tone: payload.tone,
        frequency: payload.frequency,
        daysOfWeek: payload.daysOfWeek,
        postTimes: payload.postTimes,
        includeHashtags: payload.includeHashtags,
      });
      setForm(toFormState(result.settings));
      setNextScheduledFor(result.nextScheduledFor);
      setJustSaved(true);
      setModeChosen(true);
      setNotice(
        payload.enabled ? FIRST_RUN_SAVED_NOTICE : "設定を保存しました",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!form) return;
    if (!displayConnected && !form.enabled) {
      setError("先にXを連携してください");
      return;
    }
    const nextEnabled = !form.enabled;
    update({ enabled: nextEnabled });
    await persist({ enabled: nextEnabled });
  };

  const runTrial = async () => {
    if (!form) return;
    setIsTrialRunning(true);
    setError(null);
    try {
      const result = await runXAutoPostTrialClient({
        confirm: true,
        overrideText: trialOverride.trim() || undefined,
      });
      if (result.status === "posted" || result.status === "drafted") {
        setTrialResult({
          status: result.status,
          text: result.text ?? "",
          memoryApplied: result.memoryApplied === true,
        });
        setTrialConfirmOpen(false);
        if (result.nextScheduledFor) {
          setNextScheduledFor(result.nextScheduledFor);
        }
        setNotice(X_TRIAL_SAVED_JOB_NOTICE);
        await load();
        return;
      }
      if (result.reason === "billing") {
        setError("今月の利用上限に達しました");
      } else if (result.reason === "x_not_connected") {
        setError("X接続が切れています。再連携してください。");
      } else {
        setError(result.message ?? "実行に失敗しました。成功としては扱いません。");
      }
      if (result.memoryFailed) {
        setMemory((prev) => ({ ...prev, memoryFailed: true }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "実行に失敗しました");
    } finally {
      setIsTrialRunning(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="読み込み中…" />;
  }

  if (featureDisabled) {
    return (
      <Card padding="md">
        <p className="text-sm text-[var(--foreground-muted)]">
          X連携は現在ご利用いただけません。
        </p>
      </Card>
    );
  }

  if (!form) {
    return <ErrorState message={error ?? "設定を取得できませんでした"} />;
  }

  const showConnectGate = lifecycle === "disconnected" || lifecycle === "connecting";
  const remaining = quotaLabel(quota);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">毎日のX投稿</h1>
        <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
          テーマと時間を一度決めると、次回から原稿作成〜投稿までMINERVOTが進めます。
          同じ指示を毎日入力する必要はありません。
        </p>
      </header>

      {(error || oauthErrorMessage) && (
        <ErrorState message={error ?? oauthErrorMessage ?? ""} />
      )}
      {(notice || oauthNotice) && (
        <p className="rounded-[var(--radius-lg)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success)]">
          {notice ?? oauthNotice}
        </p>
      )}

      {showConnectGate ? (
        <Card padding="md" className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            まずXを連携してください
          </h2>
          <p className="text-sm text-[var(--foreground-muted)]">
            連携が終わると、この画面でテーマ・時刻・投稿方法を続けて設定できます。
            設定画面を探す必要はありません。
          </p>
          {oauthError ? (
            <p className="text-sm text-[var(--status-error)]">
              連携がキャンセルされたか、完了しませんでした。続きはこのままやり直せます。
            </p>
          ) : null}
          <Button
            onClick={() => void handleConnect()}
            isLoading={isConnecting}
            className="min-h-[44px] w-full sm:w-auto"
          >
            {lifecycle === "connecting" ? "X連携中…" : X_OAUTH_CONTINUE_CTA}
          </Button>
        </Card>
      ) : null}

      {justSaved && displayConnected ? (
        <Card padding="md" className="space-y-4" data-testid="x-autopost-saved">
          <h2 className="text-lg font-semibold text-foreground">
            毎日のX投稿を設定しました
          </h2>
          <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
            <StatusRow
              label="テーマ"
              value={form.themes.join(" / ") || "（指定なし）"}
            />
            <StatusRow
              label="実行"
              value={`毎日 ${form.postTimes[0] ?? DEFAULT_X_POST_TIME}`}
            />
            <StatusRow label="投稿方法" value={formatXAutoPostMode(form.mode)} />
            <StatusRow label="次回" value={formatNextRunLabel(nextScheduledFor)} />
            <StatusRow
              label="前回の好み"
              value={memory.applied ? "反映する" : "まだありません"}
            />
            {remaining ? (
              <StatusRow label="残り投稿回数" value={remaining} />
            ) : null}
          </div>
          <p className="text-sm font-medium text-foreground">
            ✓ 次回から同じ指示は不要です
          </p>
          {memory.applied ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              {MEMORY_APPLIED_BADGE} · {JOB_REMEMBERED_NOTICE} · {NEXT_TIME_NO_DETAIL_NOTICE}
            </p>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">
              {JOB_REMEMBERED_NOTICE}
            </p>
          )}
          {memory.memoryFailed ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              前回の好みは今回反映できませんでした。投稿自体は設定どおり進めます。
            </p>
          ) : null}
          <Button
            className="min-h-[44px] w-full sm:w-auto"
            onClick={() => setTrialConfirmOpen(true)}
          >
            {X_TRIAL_CTA}
          </Button>
        </Card>
      ) : null}

      {trialResult ? (
        <Card padding="md" className="space-y-3" data-testid="x-autopost-trial-result">
          <h2 className="text-lg font-semibold text-foreground">
            {trialResult.status === "posted"
              ? "今日のX投稿を完了しました"
              : "今日の原稿を作成しました"}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            投稿: {trialResult.text || "（本文なし）"}
          </p>
          <StatusRow
            label="状態"
            value={
              trialResult.status === "posted"
                ? "Xへ投稿済み"
                : "確認待ち（まだXへは投稿していません）"
            }
          />
          <p className="text-sm text-[var(--foreground-muted)]">
            この仕事は記憶されています。明日も同じ設定で実行します。
          </p>
          <StatusRow label="次回" value={formatNextRunLabel(nextScheduledFor)} />
          {trialResult.memoryApplied ? (
            <Badge variant="accent">{MEMORY_APPLIED_BADGE}</Badge>
          ) : null}
        </Card>
      ) : null}

      {lifecycle === "failed" && lastResult ? (
        <Card padding="md" className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            前回の実行を完了できませんでした
          </h2>
          <p className="text-sm text-[var(--status-error)]">
            {lastResult.errorMessage || "失敗しました"}
          </p>
          {/接続|連携|token|再接続/i.test(lastResult.errorMessage ?? "") ? (
            <Button className="min-h-[44px]" onClick={() => void handleConnect()}>
              Xを再連携する
            </Button>
          ) : /上限|quota|プラン/i.test(lastResult.errorMessage ?? "") ? (
            <p className="text-sm text-foreground">今月の利用上限に達しました</p>
          ) : (
            <Button
              className="min-h-[44px]"
              variant="secondary"
              onClick={() => setTrialConfirmOpen(true)}
            >
              安全に再試行する
            </Button>
          )}
        </Card>
      ) : null}

      {!showConnectGate ? (
        <>
          <Card padding="md" className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-foreground">
                    自動投稿の状態
                  </h2>
                  <Badge variant={form.enabled ? "success" : "default"}>
                    {form.enabled ? "ON（稼働中）" : "OFF"}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {form.enabled
                    ? "次回から同じ指示をしなくても、設定した方法で実行します。"
                    : "保存すると、次回から自動で実行します。"}
                </p>
              </div>
              <Button
                variant={form.enabled ? "secondary" : "primary"}
                className="min-h-[44px]"
                onClick={() => void handleToggleEnabled()}
                isLoading={isSaving}
              >
                {form.enabled ? "自動投稿を停止する" : "自動投稿を開始する"}
              </Button>
            </div>

            {form.enabled && (
              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
                <StatusRow
                  label="次回の投稿予定"
                  value={formatXAutoPostDateTime(nextScheduledFor)}
                />
                <StatusRow label="投稿方法" value={formatXAutoPostMode(form.mode)} />
                <StatusRow
                  label="連携中のXアカウント"
                  value={
                    displayUsername ? `@${displayUsername}` : "接続済み"
                  }
                />
                <StatusRow
                  label="前回の結果"
                  value={
                    lastResult ? (
                      <span className="inline-flex items-center gap-2">
                        <RunStatusBadge run={lastResult} />
                        <span className="text-[var(--foreground-muted)]">
                          {formatXAutoPostDateTime(lastResult.createdAt)}
                        </span>
                      </span>
                    ) : (
                      "まだ実行されていません"
                    )
                  }
                />
                {memory.applied ? (
                  <StatusRow label="好み" value={MEMORY_APPLIED_BADGE} />
                ) : null}
                {remaining ? (
                  <StatusRow label="残り投稿回数" value={remaining} />
                ) : null}
              </div>
            )}
          </Card>

          <Card padding="md" className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground">投稿方法</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setModeChosen(true);
                  update({ mode: "full_auto" });
                }}
                className={
                  modeChosen && form.mode === "full_auto"
                    ? "min-h-[88px] rounded-[var(--radius-xl)] border-2 border-accent bg-[var(--brand-muted)] p-4 text-left"
                    : "min-h-[88px] rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 text-left"
                }
              >
                <p className="font-semibold text-foreground">自動投稿</p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  設定した時刻になると、MINERVOTが原稿を作成してXへ投稿します。
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModeChosen(true);
                  update({ mode: "approval" });
                }}
                className={
                  modeChosen && form.mode === "approval"
                    ? "min-h-[88px] rounded-[var(--radius-xl)] border-2 border-accent bg-[var(--brand-muted)] p-4 text-left"
                    : "min-h-[88px] rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 text-left"
                }
              >
                <p className="font-semibold text-foreground">投稿前に確認</p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  原稿を作成したら通知し、あなたの確認後に投稿します。
                </p>
              </button>
            </div>
            <p className="text-xs text-[var(--foreground-muted)]">
              自動投稿へは、あなたが選んだときだけ切り替わります。
            </p>
          </Card>

          <Card padding="md" className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground">
              {slimFirstRun ? "投稿の時間" : "投稿の頻度と時間"}
            </h2>

            {!slimFirstRun ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-foreground">頻度</span>
                  <select
                    value={form.frequency}
                    onChange={(event) =>
                      update({ frequency: event.target.value as XAutoPostFrequency })
                    }
                    className={FIELD_CLASS}
                  >
                    {X_AUTOPOST_FREQUENCY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {!slimFirstRun && frequencyOption.needsDays && (
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">投稿する曜日</span>
                <div className="flex flex-wrap gap-2">
                  {X_AUTOPOST_WEEKDAY_LABELS.map((label, day) => {
                    const active = form.daysOfWeek.includes(day);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleToggleDay(day)}
                        className={
                          active
                            ? "h-11 w-11 rounded-full bg-accent text-sm font-medium text-white"
                            : "h-11 w-11 rounded-full bg-[var(--surface-muted)] text-sm font-medium text-foreground hover:bg-[var(--secondary-hover)]"
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <span className="text-sm font-medium text-foreground">投稿する時間</span>
              <div className="space-y-2">
                {form.postTimes.map((time, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={time}
                      onChange={(event) => handleTimeChange(index, event.target.value)}
                      className={`${FIELD_CLASS} max-w-[10rem]`}
                    />
                    {form.postTimes.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px]"
                        onClick={() => handleRemoveTime(index)}
                      >
                        削除
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {!slimFirstRun && form.postTimes.length < 3 && (
                <Button variant="secondary" size="sm" onClick={handleAddTime}>
                  時間を追加
                </Button>
              )}
              <p className="text-xs text-[var(--foreground-muted)]">
                時間は日本時間（Asia/Tokyo）で保存されます。1日あたり最大3回まで設定できます。
              </p>
            </div>
          </Card>

          <Card padding="md" className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground">
              {slimFirstRun ? "投稿テーマ" : "投稿内容の設定"}
            </h2>

            {!slimFirstRun ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-foreground">目的</span>
                  <select
                    value={form.purpose}
                    onChange={(event) => update({ purpose: event.target.value })}
                    className={FIELD_CLASS}
                  >
                    {X_AUTOPOST_PURPOSE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-foreground">読み手</span>
                  <select
                    value={form.audience}
                    onChange={(event) => update({ audience: event.target.value })}
                    className={FIELD_CLASS}
                  >
                    {X_AUTOPOST_AUDIENCE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-foreground">トーン</span>
                  <select
                    value={form.tone}
                    onChange={(event) => update({ tone: event.target.value })}
                    className={FIELD_CLASS}
                  >
                    {X_AUTOPOST_TONE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex min-h-[44px] items-center gap-3 text-sm sm:mt-8">
                  <input
                    type="checkbox"
                    checked={form.includeHashtags}
                    onChange={(event) =>
                      update({ includeHashtags: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-[var(--border)] text-accent focus:ring-accent/30"
                  />
                  <span className="font-medium text-foreground">
                    ハッシュタグを付ける
                  </span>
                </label>
              </div>
            ) : null}

            <div className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                {slimFirstRun ? "テーマ" : "テーマ（複数登録できます）"}
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  value={themeDraft}
                  onChange={(event) => setThemeDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddTheme();
                    }
                  }}
                  placeholder="例：副業・仕事効率化"
                  className={`${FIELD_CLASS} max-w-xs`}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={handleAddTheme}
                >
                  追加
                </Button>
              </div>
              {form.themes.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {form.themes.map((theme) => (
                    <span
                      key={theme}
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-[var(--surface-muted)] px-3 py-1 text-sm text-foreground"
                    >
                      {theme}
                      <button
                        type="button"
                        onClick={() => handleRemoveTheme(theme)}
                        className="min-h-[44px] min-w-[44px] text-[var(--foreground-muted)] hover:text-foreground"
                        aria-label={`${theme} を削除`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-[var(--foreground-muted)]">
                {slimFirstRun
                  ? "毎日、選んだ時間に自動で実行します。"
                  : `現在の頻度：${formatXAutoPostFrequency(form.frequency)}`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {firstRun ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-[44px]"
                    onClick={() => setShowAdvanced((value) => !value)}
                  >
                    {showAdvanced ? "かんたん設定に戻す" : "高度な設定"}
                  </Button>
                ) : null}
                <Button
                  className="min-h-[44px]"
                  onClick={() =>
                    void persist(
                      slimFirstRun
                        ? {
                            enabled: true,
                            frequency: "daily_1",
                            themes:
                              form.themes.length > 0
                                ? form.themes
                                : themeDraft.trim()
                                  ? [themeDraft.trim()]
                                  : form.themes,
                          }
                        : undefined,
                    )
                  }
                  isLoading={isSaving}
                >
                  {slimFirstRun ? "保存して毎日実行する" : "設定を保存する"}
                </Button>
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {trialConfirmOpen ? (
        <Card padding="md" className="space-y-4" data-testid="x-trial-confirm">
          <h2 className="text-lg font-semibold text-foreground">
            {form.mode === "full_auto" ? X_TRIAL_CONFIRM_POST : "今すぐ原稿を作成します"}
          </h2>
          <p className="text-sm text-[var(--foreground-muted)]">
            {form.mode === "full_auto"
              ? "確認すると、本番の投稿経路でXへ公開します。成功扱いの仮表示はしません。"
              : "確認すると原稿を作成して通知します。あなたの確認前にXへは投稿しません。"}
          </p>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-foreground">今回だけの指示（任意）</span>
            <input
              value={trialOverride}
              onChange={(event) => setTrialOverride(event.target.value)}
              placeholder="例：今日は詳しく"
              className={FIELD_CLASS}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-[44px]"
              onClick={() => void runTrial()}
              isLoading={isTrialRunning}
            >
              {form.mode === "full_auto" ? "この内容で投稿する" : "原稿を作成する"}
            </Button>
            <Button
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => setTrialConfirmOpen(false)}
            >
              キャンセル
            </Button>
          </div>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">履歴</h2>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            自動投稿の履歴はまだありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {recentRuns.map((run) => (
              <li
                key={run.id}
                className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {formatXAutoPostDateTime(run.createdAt)}
                      {run.postType
                        ? ` · ${X_AUTOPOST_TYPE_LABELS[run.postType]}`
                        : ""}
                    </p>
                    <RunStatusBadge run={run} />
                  </div>
                  {run.tweetUrl && (
                    <a
                      href={run.tweetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline"
                    >
                      投稿を開く
                    </a>
                  )}
                </div>
                {run.text && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                    {run.text}
                  </p>
                )}
                {run.errorMessage && (
                  <p className="mt-2 text-sm text-[var(--status-error)]">
                    {run.errorMessage}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
