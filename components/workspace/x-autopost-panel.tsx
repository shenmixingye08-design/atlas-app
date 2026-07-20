"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  fetchXAutoPostStatusClient,
  formatXAutoPostDateTime,
  formatXAutoPostFrequency,
  formatXAutoPostMode,
  formatXAutoPostRunStatus,
  saveXAutoPostSettingsClient,
  X_AUTOPOST_AUDIENCE_PRESETS,
  X_AUTOPOST_FREQUENCY_OPTIONS,
  X_AUTOPOST_PURPOSE_PRESETS,
  X_AUTOPOST_TONE_PRESETS,
  X_AUTOPOST_TYPE_LABELS,
  X_AUTOPOST_WEEKDAY_LABELS,
  type XAutoPostRun,
  type XAutoPostSettings,
} from "@/lib/integrations/x/post/autopost-client";
import type {
  XAutoPostFrequency,
  XAutoPostMode,
} from "@/lib/integrations/x/post/autopost-types";

const FIELD_CLASS =
  "h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";

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
    postTimes: settings.postTimes.length > 0 ? settings.postTimes : ["09:00"],
    includeHashtags: settings.includeHashtags,
  };
}

function StatusRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-[var(--foreground-muted)]">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
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

export function XAutoPostPanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const [connected, setConnected] = useState(false);
  const [accountUsername, setAccountUsername] = useState<string | null>(null);
  const [nextScheduledFor, setNextScheduledFor] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<XAutoPostRun[]>([]);

  const [form, setForm] = useState<FormState | null>(null);
  const [themeDraft, setThemeDraft] = useState("");

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
      setAccountUsername(result.accountUsername);
      setNextScheduledFor(result.nextScheduledFor);
      setRecentRuns(result.recentRuns);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "設定を取得できませんでした",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const frequencyOption = useMemo(
    () =>
      X_AUTOPOST_FREQUENCY_OPTIONS.find(
        (option) => option.id === form?.frequency,
      ) ?? X_AUTOPOST_FREQUENCY_OPTIONS[0],
    [form?.frequency],
  );

  const lastResult = recentRuns[0] ?? null;

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

  const persist = async (override?: Partial<FormState>) => {
    if (!form) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    const payload = { ...form, ...override };
    try {
      const result = await saveXAutoPostSettingsClient({
        enabled: payload.enabled,
        mode: payload.mode,
        purpose: payload.purpose,
        themes: payload.themes,
        audience: payload.audience,
        tone: payload.tone,
        frequency: payload.frequency,
        daysOfWeek: payload.daysOfWeek,
        postTimes: payload.postTimes,
        includeHashtags: payload.includeHashtags,
      });
      setForm(toFormState(result.settings));
      setNextScheduledFor(result.nextScheduledFor);
      setNotice("設定を保存しました");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!form) return;
    const nextEnabled = !form.enabled;
    update({ enabled: nextEnabled });
    await persist({ enabled: nextEnabled });
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

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">X自動投稿</h1>
        <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
          目的やテーマ、トーンを一度だけご設定いただければ、以降はATLASが投稿文を作成し、
          ご指定の時間に自動で投稿いたします。会話ではなく、お客様の時間を生み出すための機能です。
        </p>
      </header>

      {error && <ErrorState message={error} />}
      {notice && (
        <p className="rounded-[var(--radius-lg)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success)]">
          {notice}
        </p>
      )}

      {/* 1. Auto-post status */}
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
                ? "設定された条件で自動投稿を行っています。"
                : "自動投稿は現在停止しています。"}
            </p>
          </div>
          <Button
            variant={form.enabled ? "secondary" : "primary"}
            onClick={() => void handleToggleEnabled()}
            isLoading={isSaving}
          >
            {form.enabled ? "自動投稿を停止する" : "自動投稿を開始する"}
          </Button>
        </div>

        {form.enabled && (
          <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
            {/* 2. Next scheduled time */}
            <StatusRow
              label="次回の投稿予定"
              value={formatXAutoPostDateTime(nextScheduledFor)}
            />
            {/* 4. Full-auto vs approval */}
            <StatusRow label="動作モード" value={formatXAutoPostMode(form.mode)} />
            {/* X account */}
            <StatusRow
              label="連携中のXアカウント"
              value={
                connected
                  ? accountUsername
                    ? `@${accountUsername}`
                    : "接続済み"
                  : "未接続"
              }
            />
            {/* Last result */}
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
          </div>
        )}

        {!connected && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--warning-bg)] px-4 py-3">
            <p className="text-sm text-foreground">
              自動投稿を行うには、Xアカウントの接続が必要です。
            </p>
            <Link
              href="/settings/x"
              className="inline-flex h-10 items-center rounded-full bg-[var(--card)] px-4 text-sm font-medium text-foreground ring-1 ring-[var(--border-subtle)] hover:bg-[var(--surface-muted)]"
            >
              Xを接続する
            </Link>
          </div>
        )}
      </Card>

      {/* 3. Frequency & times + 4. mode */}
      <Card padding="md" className="space-y-6">
        <h2 className="text-lg font-semibold text-foreground">投稿の頻度と時間</h2>

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

          <label className="block space-y-2 text-sm">
            <span className="font-medium text-foreground">動作モード</span>
            <select
              value={form.mode}
              onChange={(event) =>
                update({ mode: event.target.value as XAutoPostMode })
              }
              className={FIELD_CLASS}
            >
              <option value="approval">承認制（下書きを作成してご確認）</option>
              <option value="full_auto">完全自動（そのまま投稿）</option>
            </select>
          </label>
        </div>

        {frequencyOption.needsDays && (
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
                        ? "h-10 w-10 rounded-full bg-accent text-sm font-medium text-white"
                        : "h-10 w-10 rounded-full bg-[var(--surface-muted)] text-sm font-medium text-foreground hover:bg-[var(--secondary-hover)]"
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
                    onClick={() => handleRemoveTime(index)}
                  >
                    削除
                  </Button>
                )}
              </div>
            ))}
          </div>
          {form.postTimes.length < 3 && (
            <Button variant="secondary" size="sm" onClick={handleAddTime}>
              時間を追加
            </Button>
          )}
          <p className="text-xs text-[var(--foreground-muted)]">
            時間は日本時間（Asia/Tokyo）で保存されます。1日あたり最大3回まで設定できます。
          </p>
        </div>
      </Card>

      {/* 5. Theme / purpose / tone settings */}
      <Card padding="md" className="space-y-6">
        <h2 className="text-lg font-semibold text-foreground">
          投稿内容の設定
        </h2>

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

          <label className="flex items-center gap-3 text-sm sm:mt-8">
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

        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            テーマ（複数登録できます）
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
              placeholder="例：業務効率化、集客のコツ"
              className={`${FIELD_CLASS} max-w-xs`}
            />
            <Button variant="secondary" size="sm" onClick={handleAddTheme}>
              追加
            </Button>
          </div>
          {form.themes.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {form.themes.map((theme) => (
                <span
                  key={theme}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-3 py-1 text-sm text-foreground"
                >
                  {theme}
                  <button
                    type="button"
                    onClick={() => handleRemoveTheme(theme)}
                    className="text-[var(--foreground-muted)] hover:text-foreground"
                    aria-label={`${theme} を削除`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--foreground-muted)]">
            現在の頻度：{formatXAutoPostFrequency(form.frequency)}
          </p>
          <Button onClick={() => void persist()} isLoading={isSaving}>
            設定を保存する
          </Button>
        </div>
      </Card>

      {/* 6. Recent auto-post history */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          自動投稿の履歴
        </h2>
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
                      className="text-sm font-medium text-accent hover:underline"
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
