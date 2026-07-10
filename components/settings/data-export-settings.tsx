"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SuccessState } from "@/components/ui/success-state";
import {
  DEFAULT_EXPORT_SECTIONS,
  deleteBackupHistoryEntry,
  exportAtlasData,
  formatBackupSize,
  isAutoBackupDue,
  listBackupHistory,
  loadAutoBackupSettings,
  saveAutoBackupSettings,
  type AutoBackupSchedule,
  type BackupHistoryEntry,
  type ExportFormat,
  type ExportSectionId,
  type ExportSectionSelection,
} from "@/lib/data-export";
import { fetchExternalServiceCatalog } from "@/lib/integrations/external-services/client";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

const FORMATS: ExportFormat[] = ["json", "csv", "markdown", "zip"];
const SCHEDULES: AutoBackupSchedule[] = ["manual", "weekly", "monthly"];

const SECTION_IDS = Object.keys(DEFAULT_EXPORT_SECTIONS) as ExportSectionId[];

function progressLabel(stage: string): string {
  switch (stage) {
    case "collecting":
      return ui.dataExport.progressCollecting;
    case "formatting":
      return ui.dataExport.progressFormatting;
    case "uploading":
      return ui.dataExport.progressUploading;
    default:
      return ui.dataExport.progressDownloading;
  }
}

export function DataExportSettings() {
  const [sections, setSections] = useState<ExportSectionSelection>(
    DEFAULT_EXPORT_SECTIONS,
  );
  const [format, setFormat] = useState<ExportFormat>("zip");
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [autoBackup, setAutoBackup] = useState(loadAutoBackupSettings());
  const [googleConnected, setGoogleConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("collecting");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);

  const refreshHistory = useCallback(() => {
    setHistory(listBackupHistory());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const catalog = await fetchExternalServiceCatalog();
        if (cancelled) return;
        const google = catalog.services.find((service) => service.serviceId === "google");
        setGoogleConnected(google?.connection.status === "connected");
      } catch {
        if (!cancelled) setGoogleConnected(false);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    refreshHistory();
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshHistory]);

  useEffect(() => {
    if (!isReady || !googleConnected) return;
    if (!isAutoBackupDue(autoBackup)) return;

    void (async () => {
      try {
        await exportAtlasData({
          format: "zip",
          sections,
          destination: "google_drive",
        });
        saveAutoBackupSettings({
          lastRunAt: new Date().toISOString(),
          lastRunStatus: "success",
        });
        setAutoBackup(loadAutoBackupSettings());
        refreshHistory();
      } catch {
        saveAutoBackupSettings({
          lastRunAt: new Date().toISOString(),
          lastRunStatus: "failed",
        });
        setAutoBackup(loadAutoBackupSettings());
        refreshHistory();
      }
    })();
  }, [autoBackup, googleConnected, isReady, refreshHistory, sections]);

  const selectedCount = useMemo(
    () => SECTION_IDS.filter((id) => sections[id]).length,
    [sections],
  );

  async function handleExport(destination: "download" | "google_drive") {
    setError(null);
    setSuccess(null);
    setIsExporting(true);
    setProgress(0);
    setProgressStage("collecting");

    try {
      await exportAtlasData({
        format,
        sections,
        destination,
        onProgress: (next) => {
          setProgress(next.percent);
          setProgressStage(next.stage);
        },
      });
      setSuccess(ui.dataExport.exportSuccess);
      refreshHistory();
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : ui.dataExport.exportFailed,
      );
      refreshHistory();
    } finally {
      setIsExporting(false);
    }
  }

  function toggleSection(id: ExportSectionId) {
    setSections((current) => ({ ...current, [id]: !current[id] }));
  }

  function handleScheduleChange(schedule: AutoBackupSchedule) {
    const next = saveAutoBackupSettings({
      schedule,
      enabled: schedule !== "manual" && googleConnected,
    });
    setAutoBackup(next);
  }

  function handleDeleteHistory(id: string) {
    deleteBackupHistoryEntry(id);
    refreshHistory();
  }

  function handleClearOldHistory() {
    const entries = listBackupHistory();
    if (entries.length <= 5) return;
    for (const entry of entries.slice(5)) {
      deleteBackupHistoryEntry(entry.id);
    }
    refreshHistory();
  }

  if (!isReady) {
    return <LoadingState message={ui.dataExport.loading} />;
  }

  return (
    <div className="data-export-page space-y-8">
      <section aria-labelledby="export-sections-heading" className="space-y-4">
        <div>
          <h2 id="export-sections-heading" className="text-title text-foreground">
            {ui.dataExport.exportTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.dataExport.exportHint}
          </p>
        </div>

        <Card padding="lg" className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {ui.dataExport.sectionsTitle}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {selectedCount} / {SECTION_IDS.length}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SECTION_IDS.map((id) => (
                <label
                  key={id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-3 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={sections[id]}
                    onChange={() => toggleSection(id)}
                    className="h-4 w-4"
                  />
                  <span>{ui.dataExport.sections[id]}</span>
                </label>
              ))}
            </div>
            {sections.chat ? (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                {ui.dataExport.chatNote}
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {ui.dataExport.formatTitle}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {FORMATS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setFormat(entry)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    format === entry
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-foreground",
                  )}
                >
                  {ui.dataExport.formats[entry]}
                </button>
              ))}
            </div>
          </div>

          {isExporting ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">
                  {progressLabel(progressStage)}
                </span>
                <span className="font-medium text-foreground">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${Math.max(progress, 4)}%` }}
                />
              </div>
            </div>
          ) : null}

          {error ? <ErrorState message={error} /> : null}
          {success ? <SuccessState message={success} /> : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => handleExport("download")}
              disabled={isExporting || selectedCount === 0}
            >
              {isExporting ? ui.dataExport.exporting : ui.dataExport.exportButton}
            </Button>
            {googleConnected ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleExport("google_drive")}
                disabled={isExporting || selectedCount === 0}
              >
                {ui.dataExport.exportDriveButton}
              </Button>
            ) : null}
          </div>
        </Card>
      </section>

      <section aria-labelledby="import-heading" className="space-y-4">
        <div>
          <h2 id="import-heading" className="text-title text-foreground">
            {ui.dataExport.importTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.dataExport.importHint}
          </p>
        </div>

        <Card padding="lg" className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            {ui.dataExport.importComingSoon}
          </p>
          <label className="block">
            <span className="sr-only">{ui.dataExport.importSelectFile}</span>
            <input
              type="file"
              accept=".json,.zip,.csv,.md"
              disabled
              onChange={(event) => {
                const file = event.target.files?.[0];
                setImportFileName(file?.name ?? null);
              }}
              className="block w-full text-sm text-[var(--text-secondary)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--surface-muted)] file:px-4 file:py-2 file:text-sm file:font-medium"
            />
          </label>
          {importFileName ? (
            <p className="text-xs text-[var(--text-muted)]">
              {ui.dataExport.importSelected(importFileName)}
            </p>
          ) : null}
          <Button type="button" variant="secondary" disabled>
            {ui.dataExport.importTitle}
          </Button>
        </Card>
      </section>

      <section aria-labelledby="auto-backup-heading" className="space-y-4">
        <div>
          <h2 id="auto-backup-heading" className="text-title text-foreground">
            {ui.dataExport.autoBackupTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.dataExport.autoBackupHint}
          </p>
        </div>

        <Card padding="lg" className="space-y-4">
          {!googleConnected ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {ui.dataExport.autoBackupDisabled}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {SCHEDULES.map((schedule) => (
                <button
                  key={schedule}
                  type="button"
                  onClick={() => handleScheduleChange(schedule)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    autoBackup.schedule === schedule
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-foreground",
                  )}
                >
                  {schedule === "manual"
                    ? ui.dataExport.scheduleManual
                    : schedule === "weekly"
                      ? ui.dataExport.scheduleWeekly
                      : ui.dataExport.scheduleMonthly}
                </button>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="history-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="history-heading" className="text-title text-foreground">
              {ui.dataExport.historyTitle}
            </h2>
          </div>
          {history.length > 5 ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleClearOldHistory}>
              {ui.dataExport.historyClearOld}
            </Button>
          ) : null}
        </div>

        {history.length === 0 ? (
          <Card padding="lg">
            <p className="text-sm text-[var(--text-secondary)]">
              {ui.dataExport.historyEmpty}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <Card key={entry.id} padding="md" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {entry.fileName}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span>
                      {ui.dataExport.historyDate}:{" "}
                      {new Date(entry.createdAt).toLocaleString("ja-JP")}
                    </span>
                    <span>
                      {ui.dataExport.historySize}: {formatBackupSize(entry.sizeBytes)}
                    </span>
                    <span>
                      {ui.dataExport.historyDestination}:{" "}
                      {entry.destination === "download"
                        ? ui.dataExport.destinationDownload
                        : ui.dataExport.destinationDrive}
                    </span>
                    <span
                      className={cn(
                        entry.status === "success"
                          ? "text-[var(--success)]"
                          : "text-[var(--error)]",
                      )}
                    >
                      {ui.dataExport.historyStatus}:{" "}
                      {entry.status === "success"
                        ? ui.dataExport.statusSuccess
                        : ui.dataExport.statusFailed}
                    </span>
                  </div>
                  {entry.errorMessage ? (
                    <p className="text-xs text-[var(--error)]">{entry.errorMessage}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteHistory(entry.id)}
                >
                  {ui.dataExport.historyDelete}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
