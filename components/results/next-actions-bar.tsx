"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { connectExternalService } from "@/lib/integrations/external-services";
import {
  createXPostClient,
  fetchXPostHistoryClient,
  formatXPostedAt,
} from "@/lib/integrations/x/post/client";
import {
  validateTweetText,
  X_TWEET_MAX_CHARS,
} from "@/lib/integrations/x/post/validate";
import { ui } from "@/lib/i18n";
import type { ResultIntent } from "@/lib/results/completion";
import { loadUserWorkProfile } from "@/lib/user-profile";

type PostedInfo = { tweetUrl: string | null; postedAt: string };

type SubmitMode = "immediate" | "scheduled" | "draft" | "auto";

/** Whether 「投稿よろしく」 should fire without an extra tap (full-auto profile). */
function shouldAutoPostOnLoad(intent: ResultIntent): boolean {
  if (intent !== "post_now") return false;
  const level = loadUserWorkProfile().jobSettings.sns_post?.executionLevel;
  return level === "full_auto" || level === undefined;
}

type NextActionsBarProps = {
  intent: ResultIntent;
  tweetText: string;
  /** Notifies the parent so the completion title can reflect the posted state. */
  onPostedChange?: (posted: boolean) => void;
};

/**
 * Next-action bar for X (Twitter) post results.
 *
 * Result-first: directly under the post copy the user gets one clear primary
 * action (投稿する) plus 修正 / 予約 / 下書き. Posting is wired to the real X
 * the real X endpoints (never a fake post). If the request was 「投稿よろしく」 and
 * MINERVOT already auto-posted, the matching history record is detected on load
 * so we show the completed state (with the post URL) instead of a duplicate
 * post button.
 */
export function NextActionsBar({
  intent,
  tweetText,
  onPostedChange,
}: NextActionsBarProps) {
  const [text, setText] = useState(tweetText);
  const [mode, setMode] = useState<"idle" | "edit" | "schedule">(
    intent === "schedule" ? "schedule" : "idle",
  );
  const [scheduledFor, setScheduledFor] = useState("");
  const [submitting, setSubmitting] = useState<null | SubmitMode>(null);
  const [posted, setPosted] = useState<PostedInfo | null>(null);
  const [scheduledNotice, setScheduledNotice] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const notifiedRef = useRef(false);
  const autoPostAttemptedRef = useRef(false);

  const validation = useMemo(() => validateTweetText(text), [text]);
  const charCount = validation.charCount;

  const markPosted = (info: PostedInfo) => {
    setPosted(info);
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      onPostedChange?.(true);
    }
  };

  const handleSubmit = async (submitMode: SubmitMode) => {
    setSubmitting(submitMode);
    setError(null);
    setScheduledNotice(null);
    setDraftSaved(false);
    setNeedsConnect(false);

    try {
      const result = await createXPostClient({
        text,
        mode: submitMode,
        scheduledFor: submitMode === "scheduled" ? scheduledFor : null,
        draftId: null,
      });

      if (result.status === "x_not_connected") {
        setNeedsConnect(true);
        setError(result.message);
        return;
      }
      if (result.status === "feature_disabled") {
        setError(result.message);
        return;
      }
      if (result.status === "validation_failed") {
        setError(result.message);
        return;
      }
      if (result.status === "error") {
        setError(result.message);
        return;
      }

      if (submitMode === "immediate" || submitMode === "auto") {
        markPosted({
          tweetUrl: result.history?.tweetUrl ?? null,
          postedAt: result.history?.postedAt ?? new Date().toISOString(),
        });
      } else if (submitMode === "scheduled") {
        setScheduledNotice(scheduledFor);
        setMode("idle");
      } else {
        setDraftSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.secretaryResult.postFailed);
    } finally {
      setSubmitting(null);
    }
  };

  // Reflect an already-published post (commander auto-post) or, when the user
  // said 「投稿よろしく」 and their profile is full-auto, publish via the real X API
  // without an extra confirmation tap.
  useEffect(() => {
    let cancelled = false;
    const target = tweetText.trim();
    if (!target) return;

    void (async () => {
      try {
        const history = await fetchXPostHistoryClient();
        if (cancelled) return;

        if (history.status === "ready") {
          const match = history.records.find(
            (record) =>
              record.status === "success" && record.text.trim() === target,
          );
          if (match) {
            markPosted({ tweetUrl: match.tweetUrl, postedAt: match.postedAt });
            return;
          }
        }

        if (
          shouldAutoPostOnLoad(intent) &&
          !autoPostAttemptedRef.current &&
          validation.errors.length === 0
        ) {
          autoPostAttemptedRef.current = true;
          await handleSubmit("auto");
        }
      } catch {
        // Non-fatal: fall back to the interactive post button.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweetText, intent]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectExternalService("x");
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.secretaryResult.postFailed);
      setIsConnecting(false);
    }
  };

  if (posted) {
    return (
      <Card padding="lg" className="border border-[var(--success)]/30 bg-[var(--success-bg)]">
        <p className="text-title text-foreground">{ui.secretaryResult.postedTitle}</p>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
          {ui.secretaryResult.postedAt(formatXPostedAt(posted.postedAt))}
        </p>
        <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-foreground">
          {text}
        </p>
        {posted.tweetUrl && (
          <div className="mt-5">
            <a href={posted.tweetUrl} target="_blank" rel="noreferrer">
              <Button variant="primary" size="md">
                {ui.secretaryResult.openOnX}
              </Button>
            </a>
          </div>
        )}
      </Card>
    );
  }

  const busy = submitting !== null;

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} />}

      {needsConnect && (
        <Card padding="md" className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.secretaryResult.connectNeeded}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={isConnecting}
              onClick={() => void handleConnect()}
            >
              {isConnecting ? ui.secretaryResult.connecting : ui.secretaryResult.connect}
            </Button>
            <Link
              href="/settings/x"
              className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--surface-muted)] px-4 text-sm font-medium text-foreground hover:bg-[var(--secondary-hover)]"
            >
              {ui.secretaryResult.openXSettings}
            </Link>
          </div>
        </Card>
      )}

      {scheduledNotice && (
        <Card padding="md" className="border border-[var(--success)]/30 bg-[var(--success-bg)]">
          <p className="text-sm font-medium text-foreground">
            {ui.secretaryResult.scheduledTitle}
          </p>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {ui.secretaryResult.scheduledFor(formatXPostedAt(scheduledNotice))}
          </p>
        </Card>
      )}

      {draftSaved && (
        <Card padding="md" className="border border-[var(--border-subtle)]">
          <p className="text-sm font-medium text-foreground">
            {ui.secretaryResult.draftSavedTitle}
          </p>
          <Link
            href="/workspace/x"
            className="mt-1 inline-block text-sm font-medium text-accent hover:underline"
          >
            {ui.secretaryResult.openDrafts}
          </Link>
        </Card>
      )}

      {mode === "edit" && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            className="w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 text-base text-foreground shadow-[var(--shadow-sm)] focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span
              className={
                charCount > X_TWEET_MAX_CHARS
                  ? "text-[var(--error)]"
                  : "text-[var(--foreground-muted)]"
              }
            >
              {ui.secretaryResult.charCount(charCount, X_TWEET_MAX_CHARS)}
            </span>
          </div>
          {validation.errors.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--error)]">
              {validation.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === "schedule" && (
        <Card padding="md" className="space-y-3">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-foreground">
              {ui.secretaryResult.scheduleLabel}
            </span>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
              className="w-full max-w-xs rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !scheduledFor || validation.errors.length > 0}
              onClick={() => void handleSubmit("scheduled")}
            >
              {submitting === "scheduled"
                ? ui.secretaryResult.scheduling
                : ui.secretaryResult.scheduleConfirm}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setMode("idle")}
            >
              {ui.secretaryResult.cancel}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          variant="primary"
          size="lg"
          className="w-full sm:w-auto"
          disabled={busy || !text.trim() || validation.errors.length > 0}
          onClick={() => void handleSubmit("immediate")}
        >
          {submitting === "immediate"
            ? ui.secretaryResult.posting
            : ui.secretaryResult.postNow}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          className="w-full sm:w-auto"
          disabled={busy}
          onClick={() => setMode((prev) => (prev === "edit" ? "idle" : "edit"))}
        >
          {ui.secretaryResult.editText}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          className="w-full sm:w-auto"
          disabled={busy}
          onClick={() => setMode((prev) => (prev === "schedule" ? "idle" : "schedule"))}
        >
          {ui.secretaryResult.scheduleToggle}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          className="w-full sm:w-auto"
          disabled={busy || !text.trim()}
          onClick={() => void handleSubmit("draft")}
        >
          {submitting === "draft"
            ? ui.secretaryResult.savingDraft
            : ui.secretaryResult.saveDraft}
        </Button>
      </div>
    </div>
  );
}
