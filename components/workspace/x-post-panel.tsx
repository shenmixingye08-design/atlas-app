"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Tabs } from "@/components/ui/tabs";
import { connectExternalService } from "@/lib/integrations/external-services";
import {
  createXPostClient,
  fetchXPostHistoryClient,
  fetchXScheduledPostsClient,
  formatXPostedAt,
  formatXPostMode,
  validateXPostTextClient,
  X_TWEET_MAX_CHARS,
} from "@/lib/integrations/x/post";
import type {
  XPostHistoryRecord,
  XPostMode,
  XPostValidationSummary,
  XScheduledPost,
} from "@/lib/integrations/x/post";
import { ui } from "@/lib/i18n";

const MODE_TABS: { id: XPostMode; label: string }[] = [
  { id: "immediate", label: ui.xPost.modeImmediate },
  { id: "scheduled", label: ui.xPost.modeScheduled },
];

function ValidationSummary({ validation }: { validation: XPostValidationSummary }) {
  if (validation.errors.length === 0) return null;

  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--status-error)]">
      {validation.errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

function HistoryCard({ record }: { record: XPostHistoryRecord }) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm text-[var(--foreground-muted)]">
            {formatXPostedAt(record.postedAt)} · {formatXPostMode(record.mode)}
          </p>
          <span
            className={
              record.status === "success"
                ? "rounded-full bg-[var(--status-success-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--status-success)] ring-1 ring-[var(--status-success)]/30"
                : "rounded-full bg-[var(--status-error-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--status-error)] ring-1 ring-[var(--status-error)]/30"
            }
          >
            {record.status === "success" ? ui.xPost.statusSuccess : ui.xPost.statusFailed}
          </span>
        </div>
        {record.tweetUrl && (
          <a
            href={record.tweetUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-accent hover:underline"
          >
            {ui.xPost.openTweet}
          </a>
        )}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{record.text}</p>
      {record.errorMessage && (
        <p className="mt-2 text-sm text-[var(--status-error)]">{record.errorMessage}</p>
      )}
    </li>
  );
}

function ScheduledCard({ post }: { post: XScheduledPost }) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm text-[var(--foreground-muted)]">
        {ui.xPost.scheduledForLabel}: {formatXPostedAt(post.scheduledFor)}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{post.text}</p>
    </li>
  );
}

export function XPostPanel() {
  const [mode, setMode] = useState<XPostMode>("immediate");
  const [text, setText] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [validation, setValidation] = useState<XPostValidationSummary | null>(null);
  const [history, setHistory] = useState<XPostHistoryRecord[]>([]);
  const [scheduled, setScheduled] = useState<XScheduledPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const charCount = useMemo(() => [...text].length, [text]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNeedsConnect(false);
    setFeatureDisabled(false);

    try {
      const [historyResult, scheduledResult] = await Promise.all([
        fetchXPostHistoryClient(),
        fetchXScheduledPostsClient(),
      ]);

      if (historyResult.status === "feature_disabled") {
        setFeatureDisabled(true);
        return;
      }
      if (historyResult.status === "ready") {
        setHistory(historyResult.records);
      }

      if (scheduledResult.status === "ready") {
        setScheduled(scheduledResult.posts);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ui.error.loadFailed;
      if (message.includes("Xを接続")) {
        setNeedsConnect(true);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!text.trim()) {
        setValidation(null);
        return;
      }
      void validateXPostTextClient(text)
        .then(setValidation)
        .catch(() => setValidation(null));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [text]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectExternalService("x");
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.xSettings.connectError);
      setIsConnecting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const result = await createXPostClient({
        text,
        mode,
        scheduledFor: mode === "scheduled" ? scheduledFor : null,
      });

      if (result.status === "x_not_connected") {
        setNeedsConnect(true);
        setError(result.message);
        return;
      }
      if (result.status === "feature_disabled") {
        setFeatureDisabled(true);
        setError(result.message);
        return;
      }
      if (result.status === "validation_failed") {
        setValidation(result.validation);
        setError(result.message);
        return;
      }
      if (result.status === "error") {
        setError(result.message);
        await load();
        return;
      }

      setNotice(
        mode === "scheduled" ? ui.xPost.scheduleSuccess : ui.xPost.postSuccess,
      );
      setText("");
      setScheduledFor("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.xPost.postFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDisabled =
    isSubmitting ||
    !text.trim() ||
    (validation?.errors.length ?? 0) > 0 ||
    (mode === "scheduled" && !scheduledFor);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.xPost.title}</h1>
        <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
          {ui.xPost.subtitle}
        </p>
      </header>

      {error && <ErrorState message={error} />}
      {notice && (
        <p className="rounded-[var(--radius-lg)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success)]">
          {notice}
        </p>
      )}

      {isLoading ? (
        <LoadingState message={ui.xPost.loading} />
      ) : featureDisabled ? (
        <Card padding="md">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.externalServices.featureDisabledHint}
          </p>
        </Card>
      ) : (
        <>
          {needsConnect && (
            <Card padding="md" className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-[var(--foreground-muted)]">
                Xを接続してください
              </p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isConnecting} onClick={() => void handleConnect()}>
                  {isConnecting ? ui.xPost.connecting : ui.actions.connect}
                </Button>
                <Link
                  href="/settings/x"
                  className="inline-flex h-10 items-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-sm font-medium text-foreground ring-1 ring-[var(--border-subtle)] hover:bg-[var(--card)]"
                >
                  {ui.xPost.openSettings}
                </Link>
              </div>
            </Card>
          )}

          <Card padding="md" className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {ui.xPost.composeTitle}
              </h2>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                {ui.xPost.composeHint}
              </p>
            </div>

            <Tabs
              tabs={MODE_TABS}
              activeId={mode}
              onChange={(value) => setMode(value as XPostMode)}
            />

            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={ui.xPost.textPlaceholder}
              rows={5}
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 text-sm text-foreground shadow-[var(--shadow-sm)] focus:outline-none focus:ring-2 focus:ring-accent/25"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-[var(--foreground-muted)]">
                {ui.xPost.charCount(charCount, X_TWEET_MAX_CHARS)}
              </span>
              {validation && <ValidationSummary validation={validation} />}
            </div>

            {mode === "scheduled" && (
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">
                  {ui.xPost.scheduledForLabel}
                </span>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                  className="w-full max-w-xs rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
              </label>
            )}

            <Button disabled={submitDisabled} onClick={() => void handleSubmit()}>
              {isSubmitting
                ? mode === "scheduled"
                  ? ui.xPost.scheduling
                  : ui.xPost.posting
                : mode === "scheduled"
                  ? ui.xPost.scheduleButton
                  : ui.xPost.postButton}
            </Button>
          </Card>

          <Card padding="md" className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              {ui.xPost.automationTitle}
            </h2>
            <p className="text-sm text-[var(--foreground-muted)]">
              {ui.xPost.automationHint}
            </p>
          </Card>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              {ui.xPost.scheduledTitle}
            </h2>
            {scheduled.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.xPost.scheduledEmpty}
              </p>
            ) : (
              <ul className="space-y-3">
                {scheduled.map((post) => (
                  <ScheduledCard key={post.id} post={post} />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              {ui.xPost.historyTitle}
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.xPost.historyEmpty}
              </p>
            ) : (
              <ul className="space-y-3">
                {history.map((record) => (
                  <HistoryCard key={record.id} record={record} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
