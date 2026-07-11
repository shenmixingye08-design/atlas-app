"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Tabs } from "@/components/ui/tabs";
import { connectExternalService } from "@/lib/integrations/external-services";
import {
  aiSearchGoogleDriveClient,
  classifyGoogleDriveFileClient,
  copyGoogleDriveFileClient,
  deleteGoogleDriveFileClient,
  DRIVE_CATEGORY_FOLDERS,
  fetchGoogleDriveFilesClient,
  formatDriveFileSize,
  formatDriveKindLabel,
  formatDriveModifiedAt,
  getGoogleDriveDownloadUrl,
  moveGoogleDriveFileClient,
  saveDeliverableToDriveClient,
  searchGoogleDriveClient,
  summarizeGoogleDriveFileClient,
  uploadGoogleDriveFileClient,
} from "@/lib/integrations/google/drive/client";
import { describeDriveAutomationFlow } from "@/lib/integrations/google/drive/automation-plan";
import type {
  DriveAiSearchHit,
  DriveAiSummary,
  DriveCategoryId,
  DriveFileItem,
  DriveFilesResult,
  DriveFolderItem,
} from "@/lib/integrations/google/drive/types";
import { ui } from "@/lib/i18n";

type DriveTabId = DriveCategoryId | "all";

const CATEGORY_TABS: { id: DriveTabId; label: string }[] = [
  { id: "all", label: ui.drive.categories.all },
  ...(
    Object.entries(DRIVE_CATEGORY_FOLDERS) as [DriveCategoryId, string][]
  ).map(([id, label]) => ({ id, label })),
];

function DriveFileRow({
  file,
  folderOptions,
  busy,
  onOverwrite,
  onDownload,
  onMove,
  onCopy,
  onDelete,
  onSummarize,
  onClassify,
}: {
  file: DriveFileItem;
  folderOptions: { id: string; label: string }[];
  busy: boolean;
  onOverwrite: (file: DriveFileItem) => void;
  onDownload: (file: DriveFileItem) => void;
  onMove: (file: DriveFileItem, destinationFolderId: string) => void;
  onCopy: (file: DriveFileItem, destinationFolderId: string) => void;
  onDelete: (file: DriveFileItem) => void;
  onSummarize: (file: DriveFileItem) => void;
  onClassify: (file: DriveFileItem) => void;
}) {
  const openUrl = file.webViewLink ?? file.webContentLink;
  const [destId, setDestId] = useState(folderOptions[0]?.id ?? "");

  useEffect(() => {
    if (!destId && folderOptions[0]?.id) setDestId(folderOptions[0].id);
  }, [destId, folderOptions]);

  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-foreground">{file.name}</h3>
          <p className="text-sm text-[var(--foreground-muted)]">
            {formatDriveKindLabel(file.kind)} ·{" "}
            {DRIVE_CATEGORY_FOLDERS[file.category]} ·{" "}
            {formatDriveModifiedAt(file.modifiedAt)} ·{" "}
            {formatDriveFileSize(file.sizeBytes)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-full bg-[var(--background-subtle)] px-4 text-sm font-medium text-foreground hover:bg-[#ebebed]"
            >
              {ui.drive.openFile}
            </a>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onDownload(file)}
          >
            {ui.drive.download}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onSummarize(file)}
          >
            {ui.drive.aiSummarize}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onClassify(file)}
          >
            {ui.drive.aiClassify}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onOverwrite(file)}
          >
            {ui.drive.overwriteHint}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onDelete(file)}
          >
            {ui.drive.delete}
          </Button>
        </div>
      </div>
      {folderOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={destId}
            onChange={(event) => setDestId(event.target.value)}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm focus-ring"
          >
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !destId}
            onClick={() => onMove(file, destId)}
          >
            {ui.drive.move}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !destId}
            onClick={() => onCopy(file, destId)}
          >
            {ui.drive.copy}
          </Button>
        </div>
      )}
    </li>
  );
}

export function GoogleDrivePanel({ embedded = false }: { embedded?: boolean }) {
  const [category, setCategory] = useState<DriveTabId>("all");
  const [parentId, setParentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [useFullTextSearch, setUseFullTextSearch] = useState(false);
  const [result, setResult] = useState<DriveFilesResult | null>(null);
  const [deliverableId, setDeliverableId] = useState("");
  const [saveCategory, setSaveCategory] = useState<DriveCategoryId>("other");
  const [overwriteFileId, setOverwriteFileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [aiSummary, setAiSummary] = useState<DriveAiSummary | null>(null);
  const [aiHits, setAiHits] = useState<DriveAiSearchHit[] | null>(null);
  const [aiClassifyNotice, setAiClassifyNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (
      nextCategory: DriveTabId,
      query: string,
      nextParentId: string | null,
      fullText: boolean,
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const data =
          fullText && query
            ? await searchGoogleDriveClient({
                query,
                parentId: nextParentId ?? undefined,
              })
            : await fetchGoogleDriveFilesClient({
                category: nextCategory,
                query: query || undefined,
                parentId: nextParentId ?? undefined,
              });
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
    void load(category, appliedQuery, parentId, useFullTextSearch);
  }, [category, appliedQuery, parentId, useFullTextSearch, load]);

  const folderOptions = useMemo(() => {
    if (result?.status !== "ready") return [];
    return (Object.entries(result.snapshot.folders.categories) as [
      DriveCategoryId,
      { folderId: string; label: string },
    ][]).map(([, meta]) => ({
      id: meta.folderId,
      label: meta.label,
    }));
  }, [result]);

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

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setUseFullTextSearch(true);
    setAppliedQuery(searchQuery.trim());
  };

  const handleAiSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsBusy(true);
    setError(null);
    setAiHits(null);
    try {
      const data = await aiSearchGoogleDriveClient({
        query: searchQuery.trim(),
        category,
      });
      if (data.status !== "ready" || !("hits" in data)) {
        setError("message" in data ? data.message : ui.drive.aiSearchFailed);
        return;
      }
      setAiHits([...data.hits]);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.drive.aiSearchFailed);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    if (!deliverableId.trim()) return;

    setIsBusy(true);
    setError(null);
    setSaveNotice(null);
    try {
      const saveResult = await saveDeliverableToDriveClient({
        deliverableId: deliverableId.trim(),
        category: saveCategory,
        overwriteFileId: overwriteFileId ?? undefined,
      });

      if (saveResult.status !== "ready") {
        setError(saveResult.message);
        return;
      }

      setSaveNotice(
        saveResult.overwritten
          ? ui.drive.overwriteSuccess(saveResult.file.name)
          : ui.drive.saveSuccess(saveResult.file.name),
      );
      setOverwriteFileId(null);
      void load(category, appliedQuery, parentId, useFullTextSearch);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.drive.saveFailed);
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setIsBusy(true);
    setError(null);
    setSaveNotice(null);
    try {
      const uploadResult = await uploadGoogleDriveFileClient({
        file,
        parentId: parentId ?? undefined,
        category: category === "all" ? saveCategory : category,
      });
      if (uploadResult.status !== "ready") {
        setError(uploadResult.message);
        return;
      }
      setSaveNotice(ui.drive.uploadSuccess(uploadResult.file.name));
      void load(category, appliedQuery, parentId, useFullTextSearch);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.drive.uploadFailed);
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePrepareOverwrite = (file: DriveFileItem) => {
    setOverwriteFileId(file.id);
    setSaveCategory(file.category);
    setSaveNotice(ui.drive.overwriteReady(file.name));
  };

  const runAction = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      void load(category, appliedQuery, parentId, useFullTextSearch);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsBusy(false);
    }
  };

  const folderItems: DriveFolderItem[] =
    result?.status === "ready" ? [...result.snapshot.folderItems] : [];

  return (
    <div className={embedded ? "space-y-6" : "space-y-8 animate-fade-in"}>
      {!embedded && (
        <header className="space-y-3">
          <h1 className="text-display text-foreground">{ui.drive.title}</h1>
          <p className="max-w-2xl text-body text-[var(--foreground-muted)]">
            {ui.drive.subtitle}
          </p>
        </header>
      )}

      <Tabs
        tabs={CATEGORY_TABS}
        activeId={category}
        onChange={(id) => {
          if (id === "all" || id in DRIVE_CATEGORY_FOLDERS) {
            setParentId(null);
            setUseFullTextSearch(false);
            setCategory(id as DriveTabId);
          }
        }}
      />

      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={ui.drive.searchPlaceholder}
          className="min-w-[240px] flex-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm focus-ring"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={isBusy}>
          {ui.drive.search}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isBusy}
          onClick={() => void handleAiSearch()}
        >
          {ui.drive.aiSearch}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {ui.drive.upload}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={(event) => void handleUpload(event.target.files)}
        />
      </form>

      {parentId && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setParentId(null);
            setUseFullTextSearch(false);
          }}
        >
          {ui.drive.backToRoot}
        </Button>
      )}

      {error && <ErrorState message={error} />}
      {saveNotice && (
        <p className="text-sm text-[var(--status-success)]">{saveNotice}</p>
      )}
      {aiClassifyNotice && (
        <p className="text-sm text-[var(--foreground-muted)]">{aiClassifyNotice}</p>
      )}
      {aiSummary && (
        <Card padding="sm">
          <h2 className="text-sm font-semibold text-foreground">
            {ui.drive.aiSummaryTitle}: {aiSummary.fileName}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--foreground-muted)]">
            {aiSummary.summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      )}
      {aiHits && (
        <Card padding="sm">
          <h2 className="text-sm font-semibold text-foreground">
            {ui.drive.aiSearchTitle}
          </h2>
          {aiHits.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              {ui.drive.aiSearchEmpty}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {aiHits.map((hit) => (
                <li key={hit.fileId} className="text-sm text-[var(--foreground-muted)]">
                  <span className="font-medium text-foreground">{hit.fileName}</span>
                  {" — "}
                  {hit.reason}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {isLoading ? (
        <LoadingState message={ui.drive.loading} />
      ) : result?.status === "feature_disabled" ? (
        <Card padding="sm">
          <p className="text-sm text-[var(--foreground-muted)]">{result.message}</p>
        </Card>
      ) : result?.status === "plan_required" ? (
        <Card padding="md" className="space-y-3 text-center">
          <p className="text-body text-foreground">{result.message}</p>
          <Link
            href="/settings/billing"
            className="inline-block text-sm font-medium text-accent hover:underline"
          >
            プランを確認する
          </Link>
        </Card>
      ) : result?.status === "google_not_connected" ? (
        <Card padding="md" className="text-center">
          <div className="mx-auto max-w-md space-y-4">
            <p className="text-body text-foreground">{result.message}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => void handleConnect()} disabled={isConnecting}>
                {isConnecting ? ui.drive.connecting : ui.actions.connect}
              </Button>
              <Link
                href="/settings"
                className="text-sm text-accent hover:underline"
              >
                {ui.drive.openSettings}
              </Link>
            </div>
          </div>
        </Card>
      ) : result?.status === "ready" ? (
        <div className="space-y-6">
          <Card padding="sm" className="border border-[var(--border-subtle)]">
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {ui.drive.saveTitle}
                </h2>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  {ui.drive.saveHint}
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <input
                  type="text"
                  value={deliverableId}
                  onChange={(event) => setDeliverableId(event.target.value)}
                  placeholder={ui.drive.deliverableIdPlaceholder}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm focus-ring"
                />
                <select
                  value={saveCategory}
                  onChange={(event) =>
                    setSaveCategory(event.target.value as DriveCategoryId)
                  }
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm focus-ring"
                >
                  {(
                    Object.entries(DRIVE_CATEGORY_FOLDERS) as [
                      DriveCategoryId,
                      string,
                    ][]
                  ).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button disabled={isBusy} onClick={() => void handleSave()}>
                  {isBusy ? ui.drive.saving : ui.drive.saveButton}
                </Button>
              </div>
              {overwriteFileId && (
                <p className="text-caption text-[var(--foreground-muted)]">
                  {ui.drive.overwriteMode}
                </p>
              )}
            </div>
          </Card>

          <Card padding="sm" className="border border-[var(--border-subtle)]">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">
                {ui.drive.automationTitle}
              </h2>
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.drive.automationHint}
              </p>
              <p className="text-caption text-[var(--foreground-muted)]">
                {describeDriveAutomationFlow("sales_material")}
              </p>
              {result.snapshot.folders.rootFolderUrl && (
                <a
                  href={result.snapshot.folders.rootFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline"
                >
                  {ui.drive.openRootFolder}
                </a>
              )}
            </div>
          </Card>

          {folderItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">
                {ui.drive.foldersTitle}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {folderItems.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className="w-full rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 text-left text-sm font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-[var(--background-subtle)]"
                      onClick={() => {
                        setUseFullTextSearch(false);
                        setAppliedQuery("");
                        setParentId(folder.id);
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
            {ui.drive.filterLabel(result.snapshot.categoryLabel)} ·{" "}
            {ui.drive.fileCount(result.snapshot.files.length)}
          </p>

          {result.snapshot.files.length === 0 ? (
            <Card padding="sm">
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.drive.empty}
              </p>
            </Card>
          ) : (
            <ul className="space-y-4">
              {result.snapshot.files.map((file) => (
                <DriveFileRow
                  key={file.id}
                  file={file}
                  folderOptions={folderOptions}
                  busy={isBusy}
                  onOverwrite={handlePrepareOverwrite}
                  onDownload={(target) => {
                    window.location.href = getGoogleDriveDownloadUrl(target.id);
                  }}
                  onMove={(target, destinationFolderId) =>
                    void runAction(async () => {
                      const moved = await moveGoogleDriveFileClient({
                        fileId: target.id,
                        destinationFolderId,
                      });
                      if (moved.status !== "ready" || !("file" in moved)) {
                        throw new Error(
                          "message" in moved ? moved.message : ui.drive.move,
                        );
                      }
                      setSaveNotice(ui.drive.moveSuccess(target.name));
                    })
                  }
                  onCopy={(target, destinationFolderId) =>
                    void runAction(async () => {
                      const copied = await copyGoogleDriveFileClient({
                        fileId: target.id,
                        destinationFolderId,
                      });
                      if (copied.status !== "ready" || !("file" in copied)) {
                        throw new Error(
                          "message" in copied ? copied.message : ui.drive.copy,
                        );
                      }
                      setSaveNotice(ui.drive.copySuccess(copied.file.name));
                    })
                  }
                  onDelete={(target) =>
                    void runAction(async () => {
                      if (!window.confirm(ui.drive.deleteConfirm(target.name))) {
                        return;
                      }
                      const deleted = await deleteGoogleDriveFileClient({
                        fileId: target.id,
                      });
                      if (deleted.status !== "ready" || !("fileId" in deleted)) {
                        throw new Error(
                          "message" in deleted
                            ? deleted.message
                            : ui.drive.delete,
                        );
                      }
                      setSaveNotice(ui.drive.deleteSuccess(target.name));
                    })
                  }
                  onSummarize={(target) =>
                    void (async () => {
                      setIsBusy(true);
                      setError(null);
                      try {
                        const summary = await summarizeGoogleDriveFileClient({
                          fileId: target.id,
                        });
                        if (summary.status !== "ready" || !("summary" in summary)) {
                          setError(
                            "message" in summary
                              ? summary.message
                              : ui.drive.aiSummarizeFailed,
                          );
                          return;
                        }
                        setAiSummary(summary.summary);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : ui.drive.aiSummarizeFailed,
                        );
                      } finally {
                        setIsBusy(false);
                      }
                    })()
                  }
                  onClassify={(target) =>
                    void (async () => {
                      setIsBusy(true);
                      setError(null);
                      try {
                        const classified = await classifyGoogleDriveFileClient({
                          fileId: target.id,
                        });
                        if (
                          classified.status !== "ready" ||
                          !("classification" in classified)
                        ) {
                          setError(
                            "message" in classified
                              ? classified.message
                              : ui.drive.aiClassifyFailed,
                          );
                          return;
                        }
                        setAiClassifyNotice(
                          ui.drive.aiClassifySuccess(
                            classified.classification.fileName,
                            classified.classification.label,
                            classified.classification.reason,
                          ),
                        );
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : ui.drive.aiClassifyFailed,
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
