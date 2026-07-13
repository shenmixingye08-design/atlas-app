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
  deleteXDraftClient,
  fetchXDraftPostsClient,
  fetchXPostHistoryClient,
  fetchXPostResultClient,
  fetchXScheduledPostsClient,
  formatXPostedAt,
  formatXPostMode,
  validateXPostTextClient,
  X_TWEET_MAX_CHARS,
} from "@/lib/integrations/x/post";
import type {
  XDraftPost,
  XPostHistoryRecord,
  XPostMode,
  XPostValidationSummary,
  XScheduledPost,
} from "@/lib/integrations/x/post";
import { ui } from "@/lib/i18n";

const MODE_TABS: { id: XPostMode; label: string }[] = [
  { id: "immediate", label: ui.xPost.modeImmediate },
  { id: "scheduled", label: ui.xPost.modeScheduled },
  { id: "draft", label: ui.xPost.modeDraft },
  { id: "test", label: ui.xPost.modeTest },
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

function HistoryCard({
  record,
  onViewResult,
}: {
  record: XPostHistoryRecord;
  onViewResult: (id: string) => void;
}) {
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onViewResult(record.id)}
            className="text-sm font-medium text-accent hover:underline"
          >
            {ui.xPost.viewResult}
          </button>
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
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{record.text}</p>
      {record.errorMessage && (
        <p className="mt-2 text-sm text-[var(--status-error)]">{record.errorMessage}</p>
      )}
    </li>
  );
}

function DraftCard({
  draft,
  onUse,
  onDelete,
}: {
  draft: XDraftPost;
  onUse: (draft: XDraftPost) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm text-[var(--foreground-muted)]">
        {formatXPostedAt(draft.updatedAt)}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{draft.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => onUse(draft)}>
          {ui.xPost.useDraft}
        </Button>
        <Button variant="secondary" onClick={() => onDelete(draft.id)}>
          {ui.xPost.deleteDraft}
        </Button>
      </div>
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
      {post.errorMessage && (
        <p className="mt-2 text-sm text-[var(--status-error)]">{post.errorMessage}</p>
      )}
    </li>
  );
}

export function XPostPanel() {
  const [mode, setMode] = useState<XPostMode>("immediate");
  const [text, setText] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [validation, setValidation] = useState<XPostValidationSummary | null>(null);
  const [history, setHistory] = useState<XPostHistoryRecord[]>([]);
  const [scheduled, setScheduled] = useState<XScheduledPost[]>([]);
  const [drafts, setDrafts] = useState<XDraftPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resultDetail, setResultDetail] = useState<string | null>(null);

  const charCount = useMemo(() => [...text].length, [text]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNeedsConnect(false);
    setFeatureDisabled(false);

    try {
      const [historyResult, scheduledResult, draftsResult] = await Promise.all([
        fetchXPostHistoryClient(),
        fetchXScheduledPostsClient(),
        fetchXDraftPostsClient(),
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

      if (draftsResult.status === "ready") {
        setDrafts(draftsResult.drafts);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ui.error.loadFailed;
      if (message.includes("Xを接続") || message.includes("再接続")) {
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
      if (!text.trim() || mode === "test") {
        setValidation(null);
        return;
      }
      void validateXPostTextClient(text)
        .then(setValidation)
        .catch(() => setValidation(null));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [text, mode]);

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

  const handleViewResult = async (historyId: string) => {
    setResultDetail(null);
    setError(null);
    try {
      const result = await fetchXPostResultClient(historyId, { live: true });
      if (result.status === "ready") {
        const live = result.liveTweet
          ? ` / ライブ: ${result.liveTweet.text}`
          : "";
        setResultDetail(
          `${ui.xPost.resultTitle}: ${result.history.status === "success" ? ui.xPost.statusSuccess : ui.xPost.statusFailed}${
            result.history.tweetUrl ? ` — ${result.history.tweetUrl}` : ""
          }${
            result.history.errorMessage
              ? `（${result.history.errorMessage}）`
              : ""
          }${live}`,
        );
      } else if ("message" in result) {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    setResultDetail(null);

    try {
      const result = await createXPostClient({
        text,
        mode,
        scheduledFor: mode === "scheduled" ? scheduledFor : null,
        draftId: mode === "draft" ? draftId : null,
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

      if (mode === "scheduled") {
        setNotice(ui.xPost.scheduleSuccess);
      } else if (mode === "draft") {
        setNotice(ui.xPost.draftSuccess);
        setDraftId(result.draft?.id ?? null);
      } else if (mode === "test") {
        setNotice(
          result.history?.tweetUrl
            ? `${ui.xPost.testSuccess}: ${result.history.tweetUrl}`
            : ui.xPost.testSuccess,
        );
      } else {
        setNotice(
          result.history?.tweetUrl
            ? `${ui.xPost.postSuccess}: ${result.history.tweetUrl}`
            : ui.xPost.postSuccess,
        );
      }

      if (mode !== "draft") {
        setText("");
        setDraftId(null);
        setScheduledFor("");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.xPost.postFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseDraft = (draft: XDraftPost) => {
    setText(draft.text);
    setDraftId(draft.id);
    setMode("draft");
  };

  const handleDeleteDraft = async (id: string) => {
    setError(null);
    try {
      await deleteXDraftClient(id);
      if (draftId === id) {
        setDraftId(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    }
  };

  const submitDisabled =
    isSubmitting ||
    (mode !== "test" && !text.trim()) ||
    (validation?.errors.length ?? 0) > 0 ||
    (mode === "scheduled" && !scheduledFor);

  const submitLabel = (() => {
    if (isSubmitting) {
      if (mode === "scheduled") return ui.xPost.scheduling;
      if (mode === "draft") return ui.xPost.drafting;
      return ui.xPost.posting;
    }
    if (mode === "scheduled") return ui.xPost.scheduleButton;
    if (mode === "draft") return ui.xPost.draftButton;
    if (mode === "test") return ui.xPost.testButton;
    return ui.xPost.postButton;
  })();

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
      {resultDetail && (
        <p className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 py-3 text-sm text-foreground">
          {resultDetail}
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

            {mode !== "test" && (
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={ui.xPost.textPlaceholder}
                rows={5}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 text-sm text-foreground shadow-[var(--shadow-sm)] focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            )}

            {mode === "test" && (
              <p className="text-sm text-[var(--foreground-muted)]">
                接続確認用の短い投稿をXへ送信します。任意で本文を入力することもできます。
              </p>
            )}

            {mode !== "test" && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-[var(--foreground-muted)]">
                  {ui.xPost.charCount(charCount, X_TWEET_MAX_CHARS)}
                </span>
                {validation && <ValidationSummary validation={validation} />}
              </div>
            )}

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
              {submitLabel}
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
              {ui.xPost.draftsTitle}
            </h2>
            {drafts.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.xPost.draftsEmpty}
              </p>
            ) : (
              <ul className="space-y-3">
                {drafts.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onUse={handleUseDraft}
                    onDelete={(id) => void handleDeleteDraft(id)}
                  />
                ))}
              </ul>
            )}
          </section>

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
                  <HistoryCard
                    key={record.id}
                    record={record}
                    onViewResult={(id) => void handleViewResult(id)}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
