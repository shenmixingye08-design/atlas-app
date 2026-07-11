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
  addGmailLabelToMessageClient,
  analyzeGmailMessagesClient,
  analyzeGmailPdfClient,
  archiveGmailMessageClient,
  createGmailLabelClient,
  createGmailReplyDraftClient,
  fetchGmailLabelsClient,
  fetchGmailMessagesClient,
  fetchGmailReplyDraftsClient,
  formatGmailReceivedAt,
  saveGmailReplyDraftClient,
  sendGmailReplyClient,
  spamGmailMessageClient,
  trashGmailMessageClient,
} from "@/lib/integrations/google/gmail/client";
import type {
  GmailFilterId,
  GmailLabel,
  GmailMessage,
  GmailMessageAnalysis,
  GmailMessagesResult,
  GmailPdfAnalysis,
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
  pdfAnalyses,
  labels,
  isBusy,
  onAnalyzeReply,
  onSaveDraft,
  onSendReply,
  onArchive,
  onSpam,
  onTrash,
  onAddLabel,
  onAnalyzePdf,
}: {
  message: GmailMessage;
  analysis?: GmailMessageAnalysis;
  replyDraft?: GmailReplyDraftContent | null;
  pdfAnalyses: Record<string, GmailPdfAnalysis>;
  labels: readonly GmailLabel[];
  isBusy: boolean;
  onAnalyzeReply: (messageId: string) => void;
  onSaveDraft: (draft: GmailReplyDraftContent) => void;
  onSendReply: (draft: GmailReplyDraftContent) => void;
  onArchive: (messageId: string) => void;
  onSpam: (messageId: string) => void;
  onTrash: (messageId: string) => void;
  onAddLabel: (messageId: string, labelId: string) => void;
  onAnalyzePdf: (messageId: string, attachmentId: string) => void;
}) {
  const userLabels = labels.filter((label) => label.type === "user");

  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
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

        {message.attachments.length > 0 && (
          <div className="space-y-2 rounded-[var(--radius-lg)] bg-[var(--background-subtle)] p-3 text-sm">
            <p className="font-medium text-foreground">{ui.gmail.attachmentsTitle}</p>
            <ul className="space-y-2">
              {message.attachments.map((attachment) => {
                const pdf = pdfAnalyses[attachment.attachmentId];
                const isPdf =
                  attachment.mimeType === "application/pdf" ||
                  attachment.filename.toLowerCase().endsWith(".pdf");
                return (
                  <li key={attachment.attachmentId} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/google/gmail/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.attachmentId)}`}
                        className="text-accent hover:underline"
                      >
                        {attachment.filename}
                      </a>
                      {isPdf && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() =>
                            onAnalyzePdf(message.id, attachment.attachmentId)
                          }
                        >
                          {ui.gmail.analyzePdf}
                        </Button>
                      )}
                    </div>
                    {pdf && (
                      <ul className="list-disc pl-5 text-[var(--foreground-muted)]">
                        {pdf.summaryLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
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
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={isBusy}
                onClick={() => onSaveDraft(replyDraft)}
              >
                {ui.gmail.saveReplyDraft}
              </Button>
              <Button
                size="sm"
                disabled={isBusy}
                onClick={() => onSendReply(replyDraft)}
              >
                {ui.gmail.sendReply}
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
          <Button
            size="sm"
            variant="secondary"
            disabled={isBusy}
            onClick={() => onArchive(message.id)}
          >
            {ui.gmail.archive}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isBusy}
            onClick={() => onSpam(message.id)}
          >
            {ui.gmail.moveSpam}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isBusy}
            onClick={() => onTrash(message.id)}
          >
            {ui.gmail.trash}
          </Button>
        </div>

        {userLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--foreground-muted)]">
              {ui.gmail.addLabel}
            </span>
            <select
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
              defaultValue=""
              disabled={isBusy}
              onChange={(event) => {
                const labelId = event.target.value;
                if (labelId) {
                  onAddLabel(message.id, labelId);
                  event.target.value = "";
                }
              }}
            >
              <option value="">{ui.gmail.selectLabel}</option>
              {userLabels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
                {draft.gmailDraftId ? ` · ${ui.gmail.gmailDraftSaved}` : ""}
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
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [result, setResult] = useState<GmailMessagesResult | null>(null);
  const [analyses, setAnalyses] = useState<GmailMessageAnalysis[]>([]);
  const [importantIds, setImportantIds] = useState<Set<string>>(new Set());
  const [replyDrafts, setReplyDrafts] = useState<
    Record<string, GmailReplyDraftContent>
  >({});
  const [pdfAnalyses, setPdfAnalyses] = useState<Record<string, GmailPdfAnalysis>>(
    {},
  );
  const [savedDrafts, setSavedDrafts] = useState<GmailSavedReplyDraft[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [newLabelName, setNewLabelName] = useState("");
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

  const loadLabels = useCallback(async () => {
    try {
      setLabels(await fetchGmailLabelsClient());
    } catch {
      setLabels([]);
    }
  }, []);

  const load = useCallback(
    async (nextFilter: GmailFilterId, searchQuery?: string | null) => {
      setIsLoading(true);
      setError(null);
      setAnalyses([]);
      setImportantIds(new Set());
      setReplyDrafts({});
      setPdfAnalyses({});
      try {
        const data = await fetchGmailMessagesClient(
          nextFilter,
          searchQuery ?? undefined,
        );
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
    void load(filter, activeSearch);
    void loadSavedDrafts();
    void loadLabels();
  }, [filter, activeSearch, load, loadSavedDrafts, loadLabels]);

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
      setActiveSearch(null);
      setFilter(id);
    }
  };

  const handleSearch = () => {
    const q = searchInput.trim();
    if (!q) {
      setActiveSearch(null);
      return;
    }
    setActiveSearch(q);
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

  const handleSendReply = async (draft: GmailReplyDraftContent) => {
    if (!window.confirm(ui.gmail.sendConfirm)) return;
    setBusyMessageId(draft.messageId);
    setError(null);
    setSaveNotice(null);
    try {
      await sendGmailReplyClient(draft);
      setSaveNotice(ui.gmail.sentNotice);
      setReplyDrafts((current) => {
        const next = { ...current };
        delete next[draft.messageId];
        return next;
      });
      await load(filter, activeSearch);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.sendFailed);
    } finally {
      setBusyMessageId(null);
    }
  };

  const removeMessageLocally = (messageId: string) => {
    setResult((current) => {
      if (!current || current.status !== "ready") return current;
      return {
        ...current,
        snapshot: {
          ...current.snapshot,
          messages: current.snapshot.messages.filter(
            (message) => message.id !== messageId,
          ),
        },
      };
    });
  };

  const handleArchive = async (messageId: string) => {
    setBusyMessageId(messageId);
    setError(null);
    try {
      await archiveGmailMessageClient(messageId);
      removeMessageLocally(messageId);
      setSaveNotice(ui.gmail.archivedNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.archiveFailed);
    } finally {
      setBusyMessageId(null);
    }
  };

  const handleSpam = async (messageId: string) => {
    if (!window.confirm(ui.gmail.spamConfirm)) return;
    setBusyMessageId(messageId);
    setError(null);
    try {
      await spamGmailMessageClient(messageId);
      removeMessageLocally(messageId);
      setSaveNotice(ui.gmail.spamNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.spamFailed);
    } finally {
      setBusyMessageId(null);
    }
  };

  const handleTrash = async (messageId: string) => {
    if (!window.confirm(ui.gmail.trashConfirm)) return;
    setBusyMessageId(messageId);
    setError(null);
    try {
      await trashGmailMessageClient(messageId);
      removeMessageLocally(messageId);
      setSaveNotice(ui.gmail.trashNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.trashFailed);
    } finally {
      setBusyMessageId(null);
    }
  };

  const handleAddLabel = async (messageId: string, labelId: string) => {
    setBusyMessageId(messageId);
    setError(null);
    try {
      await addGmailLabelToMessageClient(messageId, labelId);
      setSaveNotice(ui.gmail.labelAddedNotice);
      await load(filter, activeSearch);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.labelFailed);
    } finally {
      setBusyMessageId(null);
    }
  };

  const handleCreateLabel = async () => {
    const name = newLabelName.trim();
    if (!name) return;
    setError(null);
    try {
      const label = await createGmailLabelClient(name);
      setLabels((current) => [...current, label]);
      setNewLabelName("");
      setSaveNotice(ui.gmail.labelCreatedNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.labelFailed);
    }
  };

  const handleAnalyzePdf = async (messageId: string, attachmentId: string) => {
    setBusyMessageId(messageId);
    setError(null);
    try {
      const analysis = await analyzeGmailPdfClient(messageId, attachmentId);
      setPdfAnalyses((current) => ({
        ...current,
        [attachmentId]: analysis,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.gmail.pdfAnalyzeFailed);
    } finally {
      setBusyMessageId(null);
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

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={ui.gmail.searchPlaceholder}
          className="min-w-[220px] flex-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSearch();
          }}
        />
        <Button size="sm" variant="secondary" onClick={handleSearch}>
          {ui.gmail.search}
        </Button>
      </div>

      <Card padding="sm" className="border border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 space-y-1 text-sm">
            <span className="text-[var(--foreground-muted)]">
              {ui.gmail.labelsTitle}
            </span>
            <input
              value={newLabelName}
              onChange={(event) => setNewLabelName(event.target.value)}
              placeholder={ui.gmail.newLabelPlaceholder}
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            />
          </label>
          <Button size="sm" variant="secondary" onClick={() => void handleCreateLabel()}>
            {ui.gmail.createLabel}
          </Button>
        </div>
        {labels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {labels.slice(0, 20).map((label) => (
              <span
                key={label.id}
                className="rounded-full bg-[var(--background-subtle)] px-2.5 py-0.5 text-xs text-[var(--foreground-muted)]"
              >
                {label.name}
              </span>
            ))}
          </div>
        )}
      </Card>

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
                  pdfAnalyses={pdfAnalyses}
                  labels={labels}
                  isBusy={busyMessageId === message.id}
                  onAnalyzeReply={handleCreateReplyDraft}
                  onSaveDraft={handleSaveDraft}
                  onSendReply={handleSendReply}
                  onArchive={handleArchive}
                  onSpam={handleSpam}
                  onTrash={handleTrash}
                  onAddLabel={handleAddLabel}
                  onAnalyzePdf={handleAnalyzePdf}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
