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
  analyzeGmailMessagesClient,
  createGmailReplyDraftClient,
  fetchGmailMessagesClient,
  fetchGmailReplyDraftsClient,
  formatGmailReceivedAt,
  saveGmailReplyDraftClient,
} from "@/lib/integrations/google/gmail/client";
import type {
  GmailFilterId,
  GmailMessage,
  GmailMessageAnalysis,
  GmailMessagesResult,
  GmailReplyDraftContent,
  GmailSavedReplyDraft,
} from "@/lib/integrations/google/gmail/types";
import { ui } from "@/lib/i18n";

const FILTER_TABS: { id: GmailFilterId; label: string }[] = [
  { id: "unread", label: ui.gmail.filters.unread },
  { id: "today", label: ui.gmail.filters.today },
  { id: "this_week", label: ui.gmail.filters.thisWeek },
];

function GmailMessageCard({
  message,
  analysis,
  replyDraft,
  isBusy,
  onAnalyzeReply,
  onSaveDraft,
}: {
  message: GmailMessage;
  analysis?: GmailMessageAnalysis;
  replyDraft?: GmailReplyDraftContent | null;
  isBusy: boolean;
  onAnalyzeReply: (messageId: string) => void;
  onSaveDraft: (draft: GmailReplyDraftContent) => void;
}) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              {message.subject}
            </h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              {message.sender} · {formatGmailReceivedAt(message.receivedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {message.isUnread && (
              <span className="rounded-full bg-[var(--status-warning-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--status-warning)] ring-1 ring-[var(--status-warning)]/30">
                {ui.gmail.unreadBadge}
              </span>
            )}
            {analysis?.isImportant && (
              <span className="rounded-full bg-[var(--status-error-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--status-error)] ring-1 ring-[var(--status-error)]/30">
                {ui.gmail.importantBadge}
              </span>
            )}
          </div>
        </div>

        {message.labels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.labels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-[var(--background-subtle)] px-2 py-0.5 text-xs text-[var(--foreground-muted)] ring-1 ring-[var(--border)]"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {message.bodyText && (
          <p className="line-clamp-4 whitespace-pre-wrap text-sm text-[var(--foreground-muted)]">
            {message.bodyText}
          </p>
        )}

        {analysis && (
          <div className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] p-3 text-sm">
            <p className="font-medium text-foreground">{ui.gmail.summaryTitle}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--foreground-muted)]">
              {analysis.summaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {analysis.isImportant && (
              <p className="mt-2 text-[var(--foreground-muted)]">
                {ui.gmail.importanceReason}: {analysis.importanceReason}
              </p>
            )}
          </div>
        )}

        {replyDraft && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3 text-sm">
            <p className="font-medium text-foreground">{ui.gmail.replyDraftTitle}</p>
            <p className="mt-1 text-[var(--foreground-muted)]">
              {ui.gmail.replyTo}: {replyDraft.to}
            </p>
            <p className="mt-1 text-[var(--foreground-muted)]">
              {ui.gmail.replySubject}: {replyDraft.subject}
            </p>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-foreground">
              {replyDraft.body}
            </pre>
            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={isBusy}
                onClick={() => onSaveDraft(replyDraft)}
              >
                {ui.gmail.saveReplyDraft}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={isBusy}
            onClick={() => onAnalyzeReply(message.id)}
          >
            {ui.gmail.createReplyDraft}
          </Button>
        </div>
      </div>
    </li>
  );
}

function SavedReplyDraftsPanel({
  drafts,
}: {
  drafts: readonly GmailSavedReplyDraft[];
}) {
  if (drafts.length === 0) return null;

  return (
    <Card padding="sm" className="border border-[var(--border-subtle)]">
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {ui.gmail.savedDraftsTitle}
          </h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {ui.gmail.savedDraftsHint}
          </p>
        </div>
        <ul className="space-y-3">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] p-3 text-sm"
            >
              <p className="font-medium text-foreground">{draft.subject}</p>
              <p className="text-[var(--foreground-muted)]">
                {draft.to} · {formatGmailReceivedAt(draft.savedAt)}
              </p>
              <pre className="mt-2 line-clamp-4 whitespace-pre-wrap font-sans text-[var(--foreground-muted)]">
                {draft.body}
              </pre>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function GoogleMailPanel() {
  const [filter, setFilter] = useState<GmailFilterId>("unread");
  const [result, setResult] = useState<GmailMessagesResult | null>(null);
  const [analyses, setAnalyses] = useState<GmailMessageAnalysis[]>([]);
  const [importantIds, setImportantIds] = useState<Set<string>>(new Set());
  const [replyDrafts, setReplyDrafts] = useState<
    Record<string, GmailReplyDraftContent>
  >({});
  const [savedDrafts, setSavedDrafts] = useState<GmailSavedReplyDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const analysisById = useMemo(
    () => new Map(analyses.map((item) => [item.messageId, item])),
    [analyses],
  );

  const loadSavedDrafts = useCallback(async () => {
    try {
      const drafts = await fetchGmailReplyDraftsClient();
      setSavedDrafts(drafts);
    } catch {
      setSavedDrafts([]);
    }
  }, []);

  const load = useCallback(
    async (nextFilter: GmailFilterId) => {
      setIsLoading(true);
      setError(null);
      setAnalyses([]);
      setImportantIds(new Set());
      setReplyDrafts({});
      try {
        const data = await fetchGmailMessagesClient(nextFilter);
        setResult(data);
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : ui.error.loadFailed);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(filter);
    void loadSavedDrafts();
  }, [filter, load, loadSavedDrafts]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectExternalService("google");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.externalServices.googleConnectError,
      );
      setIsConnecting(false);
    }
  };

  const handleFilterChange = (id: string) => {
    if (id === "unread" || id === "today" || id === "this_week") {
      setFilter(id);
    }
  };

  const handleBatchAnalyze = async () => {
    if (result?.status !== "ready" || result.snapshot.messages.length === 0) {
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    try {
      const messageIds = result.snapshot.messages.map((message) => message.id);
      const payload = await analyzeGmailMessagesClient(messageIds);
      setAnalyses(payload.analyses);
      setImportantIds(new Set(payload.important.map((item) => item.messageId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.analyzeFailed);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateReplyDraft = async (messageId: string) => {
    setBusyMessageId(messageId);
    setError(null);
    try {
      const draft = await createGmailReplyDraftClient(messageId);
      setReplyDrafts((current) => ({ ...current, [messageId]: draft }));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.replyDraftFailed);
    } finally {
      setBusyMessageId(null);
    }
  };

  const handleSaveDraft = async (draft: GmailReplyDraftContent) => {
    setError(null);
    setSaveNotice(null);
    try {
      const saved = await saveGmailReplyDraftClient(draft);
      setSavedDrafts((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setSaveNotice(ui.gmail.savedDraftNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.saveDraftFailed);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.gmail.title}</h1>
        <p className="max-w-2xl text-body text-[var(--foreground-muted)]">
          {ui.gmail.subtitle}
        </p>
      </header>

      <Tabs tabs={FILTER_TABS} activeId={filter} onChange={handleFilterChange} />

      {error && <ErrorState message={error} />}
      {saveNotice && (
        <p className="text-sm text-[var(--status-success)]">{saveNotice}</p>
      )}

      {isLoading ? (
        <LoadingState message={ui.gmail.loading} />
      ) : result?.status === "feature_disabled" ? (
        <Card padding="sm">
          <p className="text-sm text-[var(--foreground-muted)]">{result.message}</p>
        </Card>
      ) : result?.status === "google_not_connected" ? (
        <Card padding="md" className="text-center">
          <div className="mx-auto max-w-md space-y-4">
            <p className="text-body text-foreground">{result.message}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => void handleConnect()} disabled={isConnecting}>
                {isConnecting ? ui.gmail.connecting : ui.actions.connect}
              </Button>
              <Link
                href="/settings"
                className="text-sm text-accent hover:underline"
              >
                {ui.gmail.openSettings}
              </Link>
            </div>
          </div>
        </Card>
      ) : result?.status === "ready" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-[var(--foreground-muted)]">
              {ui.gmail.filterLabel(result.snapshot.filterLabel)} ·{" "}
              {ui.gmail.messageCount(result.snapshot.messages.length)}
              {importantIds.size > 0 &&
                ` · ${ui.gmail.importantCount(importantIds.size)}`}
            </p>
            {result.snapshot.messages.length > 0 && (
              <Button
                size="sm"
                disabled={isAnalyzing}
                onClick={() => void handleBatchAnalyze()}
              >
                {isAnalyzing ? ui.gmail.analyzing : ui.gmail.analyzeButton}
              </Button>
            )}
          </div>

          <SavedReplyDraftsPanel drafts={savedDrafts} />

          {result.snapshot.messages.length === 0 ? (
            <Card padding="sm">
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.gmail.empty}
              </p>
            </Card>
          ) : (
            <ul className="space-y-4">
              {result.snapshot.messages.map((message) => (
                <GmailMessageCard
                  key={message.id}
                  message={message}
                  analysis={analysisById.get(message.id)}
                  replyDraft={replyDrafts[message.id] ?? null}
                  isBusy={busyMessageId === message.id}
                  onAnalyzeReply={handleCreateReplyDraft}
                  onSaveDraft={handleSaveDraft}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
