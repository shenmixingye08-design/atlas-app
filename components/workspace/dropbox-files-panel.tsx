"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { connectExternalService } from "@/lib/integrations/external-services";
import {
  analyzeDropboxPdfClient,
  deleteDropboxFileClient,
  fetchDropboxFilesClient,
  formatDropboxFileSize,
  formatDropboxKindLabel,
  formatDropboxModifiedAt,
  getDropboxDownloadUrl,
  shareDropboxFileClient,
  summarizeDropboxFileClient,
  uploadDropboxFileClient,
} from "@/lib/integrations/dropbox/client";
import type {
  DropboxAiSummary,
  DropboxFileItem,
  DropboxFilesResult,
  DropboxPdfAnalysis,
} from "@/lib/integrations/dropbox/types";
import { ui } from "@/lib/i18n";

function DropboxFileRow({
  file,
  busy,
  onDelete,
  onShare,
  onDownload,
  onSummarize,
  onAnalyzePdf,
}: {
  file: DropboxFileItem;
  busy: boolean;
  onDelete: (file: DropboxFileItem) => void;
  onShare: (file: DropboxFileItem) => void;
  onDownload: (file: DropboxFileItem) => void;
  onSummarize: (file: DropboxFileItem) => void;
  onAnalyzePdf: (file: DropboxFileItem) => void;
}) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-foreground">{file.name}</h3>
          <p className="text-sm text-[var(--foreground-muted)]">
            {formatDropboxKindLabel(file.kind)} ·{" "}
            {formatDropboxModifiedAt(file.modifiedAt)} ·{" "}
            {formatDropboxFileSize(file.sizeBytes)}
          </p>
          <p className="truncate text-xs text-[var(--foreground-muted)]">
            {file.pathDisplay}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onDownload(file)}
          >
            {ui.dropbox.download}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onSummarize(file)}
          >
            {ui.dropbox.aiSummarize}
          </Button>
          {file.kind === "pdf" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onAnalyzePdf(file)}
            >
              {ui.dropbox.pdfAnalyze}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onShare(file)}
          >
            {ui.dropbox.share}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onDelete(file)}
          >
            {ui.dropbox.delete}
          </Button>
        </div>
      </div>
    </li>
  );
}

export function DropboxFilesPanel({ embedded = false }: { embedded?: boolean }) {
  const [path, setPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [result, setResult] = useState<DropboxFilesResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<DropboxAiSummary | null>(null);
  const [pdfAnalysis, setPdfAnalysis] = useState<DropboxPdfAnalysis | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (nextPath: string, query: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDropboxFilesClient({
        path: nextPath || undefined,
        query: query || undefined,
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(path, appliedQuery);
  }, [path, appliedQuery, load]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectExternalService("dropbox");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.dropbox.connectError,
      );
      setIsConnecting(false);
    }
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedQuery(searchQuery.trim());
  };

  const handleUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded = await uploadDropboxFileClient({
        file,
        parentPath: path || undefined,
      });
      if (uploaded.status !== "ready") {
        setError(uploaded.message);
        return;
      }
      setNotice(ui.dropbox.uploadSuccess(uploaded.file.name));
      void load(path, appliedQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.dropbox.uploadFailed);
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const parentPath = path.includes("/")
    ? path.replace(/\/[^/]+$/, "")
    : "";

  return (
    <div className={embedded ? "space-y-6" : "space-y-8 animate-fade-in"}>
      {!embedded && (
        <header className="space-y-3">
          <h1 className="text-display text-foreground">{ui.dropbox.title}</h1>
          <p className="max-w-2xl text-body text-[var(--foreground-muted)]">
            {ui.dropbox.subtitle}
          </p>
        </header>
      )}

      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={ui.dropbox.searchPlaceholder}
          className="min-w-[240px] flex-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm focus-ring"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={isBusy}>
          {ui.dropbox.search}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {ui.dropbox.upload}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf"
          onChange={(event) => void handleUpload(event.target.files)}
        />
      </form>

      {path && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setAppliedQuery("");
            setPath(parentPath);
          }}
        >
          {ui.dropbox.back}
        </Button>
      )}

      {error && <ErrorState message={error} />}
      {notice && (
        <p className="text-sm text-[var(--status-success)]">{notice}</p>
      )}

      {aiSummary && (
        <Card padding="sm">
          <h2 className="text-sm font-semibold text-foreground">
            {ui.dropbox.aiSummaryTitle}: {aiSummary.fileName}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--foreground-muted)]">
            {aiSummary.summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      )}

      {pdfAnalysis && (
        <Card padding="sm">
          <h2 className="text-sm font-semibold text-foreground">
            {ui.dropbox.pdfTitle}: {pdfAnalysis.fileName}
          </h2>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            {ui.dropbox.pdfChars(pdfAnalysis.extractedChars)}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--foreground-muted)]">
            {pdfAnalysis.summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      )}

      {isLoading ? (
        <LoadingState message={ui.dropbox.loading} />
      ) : result?.status === "feature_disabled" ? (
        <Card padding="sm">
          <p className="text-sm text-[var(--foreground-muted)]">{result.message}</p>
        </Card>
      ) : result?.status === "dropbox_not_connected" ? (
        <Card padding="md" className="text-center">
          <div className="mx-auto max-w-md space-y-4">
            <p className="text-body text-foreground">{result.message}</p>
            <Button onClick={() => void handleConnect()} disabled={isConnecting}>
              {isConnecting ? ui.dropbox.connecting : ui.actions.connect}
            </Button>
          </div>
        </Card>
      ) : result?.status === "ready" ? (
        <div className="space-y-6">
          {result.snapshot.folders.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">
                {ui.dropbox.foldersTitle}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {result.snapshot.folders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className="w-full rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 text-left text-sm font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-[var(--background-subtle)]"
                      onClick={() => {
                        setAppliedQuery("");
                        setPath(folder.pathDisplay);
                      }}
                    >
                      {folder.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-caption text-[var(--foreground-muted)]">
            {ui.dropbox.pathLabel(result.snapshot.path || "/")} ·{" "}
            {ui.dropbox.fileCount(result.snapshot.files.length)}
          </p>

          {result.snapshot.files.length === 0 ? (
            <Card padding="sm">
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.dropbox.empty}
              </p>
            </Card>
          ) : (
            <ul className="space-y-4">
              {result.snapshot.files.map((file) => (
                <DropboxFileRow
                  key={file.id}
                  file={file}
                  busy={isBusy}
                  onDownload={(target) => {
                    window.location.href = getDropboxDownloadUrl(
                      target.pathDisplay,
                    );
                  }}
                  onDelete={(target) =>
                    void (async () => {
                      if (!window.confirm(ui.dropbox.deleteConfirm(target.name))) {
                        return;
                      }
                      setIsBusy(true);
                      setError(null);
                      try {
                        const deleted = await deleteDropboxFileClient({
                          path: target.pathDisplay,
                        });
                        if (deleted.status !== "ready") {
                          setError(
                            "message" in deleted
                              ? deleted.message
                              : ui.dropbox.deleteFailed,
                          );
                          return;
                        }
                        setNotice(ui.dropbox.deleteSuccess(target.name));
                        void load(path, appliedQuery);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : ui.dropbox.deleteFailed,
                        );
                      } finally {
                        setIsBusy(false);
                      }
                    })()
                  }
                  onShare={(target) =>
                    void (async () => {
                      setIsBusy(true);
                      setError(null);
                      try {
                        const shared = await shareDropboxFileClient({
                          path: target.pathDisplay,
                        });
                        if (shared.status !== "ready") {
                          setError(shared.message);
                          return;
                        }
                        setNotice(ui.dropbox.shareSuccess(shared.url));
                        if (typeof navigator !== "undefined" && navigator.clipboard) {
                          await navigator.clipboard.writeText(shared.url);
                        }
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : ui.dropbox.shareFailed,
                        );
                      } finally {
                        setIsBusy(false);
                      }
                    })()
                  }
                  onSummarize={(target) =>
                    void (async () => {
                      setIsBusy(true);
                      setError(null);
                      try {
                        const summary = await summarizeDropboxFileClient({
                          path: target.pathDisplay,
                        });
                        if (summary.status !== "ready" || !("summary" in summary)) {
                          setError(
                            "message" in summary
                              ? summary.message
                              : ui.dropbox.aiSummarizeFailed,
                          );
                          return;
                        }
                        setAiSummary(summary.summary);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : ui.dropbox.aiSummarizeFailed,
                        );
                      } finally {
                        setIsBusy(false);
                      }
                    })()
                  }
                  onAnalyzePdf={(target) =>
                    void (async () => {
                      setIsBusy(true);
                      setError(null);
                      try {
                        const analysis = await analyzeDropboxPdfClient({
                          path: target.pathDisplay,
                        });
                        if (
                          analysis.status !== "ready" ||
                          !("analysis" in analysis)
                        ) {
                          setError(
                            "message" in analysis
                              ? analysis.message
                              : ui.dropbox.pdfFailed,
                          );
                          return;
                        }
                        setPdfAnalysis(analysis.analysis);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : ui.dropbox.pdfFailed,
                        );
                      } finally {
                        setIsBusy(false);
                      }
                    })()
                  }
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
