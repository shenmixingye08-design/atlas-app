"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Tabs } from "@/components/ui/tabs";
import { connectExternalService } from "@/lib/integrations/external-services";
import {
  DRIVE_CATEGORY_FOLDERS,
  fetchGoogleDriveFilesClient,
  formatDriveFileSize,
  formatDriveModifiedAt,
  saveDeliverableToDriveClient,
} from "@/lib/integrations/google/drive/client";
import { describeDriveAutomationFlow } from "@/lib/integrations/google/drive/automation-plan";
import type {
  DriveCategoryId,
  DriveFileItem,
  DriveFilesResult,
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
  isSaving,
  onOverwrite,
}: {
  file: DriveFileItem;
  isSaving: boolean;
  onOverwrite: (file: DriveFileItem) => void;
}) {
  const openUrl = file.webViewLink ?? file.webContentLink;

  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-foreground">{file.name}</h3>
          <p className="text-sm text-[var(--foreground-muted)]">
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
            disabled={isSaving}
            onClick={() => onOverwrite(file)}
          >
            {ui.drive.overwriteHint}
          </Button>
        </div>
      </div>
    </li>
  );
}

export function GoogleDrivePanel() {
  const [category, setCategory] = useState<DriveTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [result, setResult] = useState<DriveFilesResult | null>(null);
  const [deliverableId, setDeliverableId] = useState("");
  const [saveCategory, setSaveCategory] = useState<DriveCategoryId>("other");
  const [overwriteFileId, setOverwriteFileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const load = useCallback(
    async (nextCategory: DriveTabId, query: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchGoogleDriveFilesClient({
          category: nextCategory,
          query: query || undefined,
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
    void load(category, appliedQuery);
  }, [category, appliedQuery, load]);

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
    setAppliedQuery(searchQuery.trim());
  };

  const handleSave = async () => {
    if (!deliverableId.trim()) return;

    setIsSaving(true);
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
      void load(category, appliedQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.drive.saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrepareOverwrite = (file: DriveFileItem) => {
    setOverwriteFileId(file.id);
    setSaveCategory(file.category);
    setSaveNotice(ui.drive.overwriteReady(file.name));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.drive.title}</h1>
        <p className="max-w-2xl text-body text-[var(--foreground-muted)]">
          {ui.drive.subtitle}
        </p>
      </header>

      <Tabs
        tabs={CATEGORY_TABS}
        activeId={category}
        onChange={(id) => {
          if (id === "all" || id in DRIVE_CATEGORY_FOLDERS) {
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
          className="min-w-[240px] flex-1 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm focus-ring"
        />
        <Button type="submit" size="sm" variant="secondary">
          {ui.actions.search}
        </Button>
      </form>

      {error && <ErrorState message={error} />}
      {saveNotice && (
        <p className="text-sm text-[var(--status-success)]">{saveNotice}</p>
      )}

      {isLoading ? (
        <LoadingState message={ui.drive.loading} />
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
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-4 py-2 text-sm focus-ring"
                />
                <select
                  value={saveCategory}
                  onChange={(event) =>
                    setSaveCategory(event.target.value as DriveCategoryId)
                  }
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-4 py-2 text-sm focus-ring"
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
                <Button disabled={isSaving} onClick={() => void handleSave()}>
                  {isSaving ? ui.drive.saving : ui.drive.saveButton}
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
                  isSaving={isSaving}
                  onOverwrite={handlePrepareOverwrite}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
