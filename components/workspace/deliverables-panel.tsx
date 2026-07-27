"use client";

import { useState } from "react";

import { downloadDeliverableFile } from "@/lib/deliverables/download-client";
import type { Deliverable } from "@/lib/deliverables/types";
import { DELIVERABLE_FORMAT_LABELS } from "@/lib/deliverables/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

type DeliverablesPanelProps = {
  deliverables: Deliverable[];
  isGenerating: boolean;
  error: string | null;
  matchedRule?: string | null;
  sourceText?: string | null;
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBadge(format: Deliverable["format"]): string {
  if (format === "docx") return ".docx";
  if (format === "pptx") return ".pptx";
  if (format === "xlsx") return ".xlsx";
  if (format === "pdf") return ".pdf";
  if (format === "md") return ".md";
  return ".txt";
}

function DeliverableDownloadButton({ item }: { item: Deliverable }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      await downloadDeliverableFile({
        url: item.downloadUrl,
        fileName: item.fileName,
        mimeType: item.mimeType,
        format: item.format,
      });
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : ui.work.downloadFailed,
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <Button
        variant="primary"
        size="lg"
        className="w-full min-h-11 touch-manipulation"
        disabled={isDownloading}
        onClick={() => void handleDownload()}
      >
        {isDownloading ? ui.work.downloadingFile : ui.actions.download}
      </Button>
      {downloadError ? <ErrorState message={downloadError} /> : null}
    </div>
  );
}

export function DeliverablesPanel({
  deliverables,
  isGenerating,
  error,
  sourceText,
}: DeliverablesPanelProps) {
  if (!isGenerating && deliverables.length === 0 && !error) {
    return null;
  }

  return (
    <section className="space-y-6 animate-fade-in" aria-labelledby="deliverables-heading">
      <h2 id="deliverables-heading" className="text-title text-foreground">
        {ui.work.deliverables}
      </h2>

      {isGenerating && (
        <p className="animate-soft-pulse text-body">{ui.work.preparingFiles}</p>
      )}

      {error && <ErrorState message={error} />}

      <div className="space-y-6">
        {deliverables.map((item) => (
          <Card key={item.id} padding="lg">
            <div className="flex items-start gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] text-sm font-semibold text-foreground"
                aria-hidden
              >
                {item.format === "docx"
                  ? "W"
                  : item.format === "pdf"
                    ? "P"
                    : item.format === "xlsx"
                      ? "X"
                      : item.format.toUpperCase().slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-base font-medium text-foreground">
                  {item.fileName}
                </p>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {DELIVERABLE_FORMAT_LABELS[item.format]} · {formatBadge(item.format)}
                </p>
                <p className="text-caption text-[var(--foreground-muted)]">
                  {formatGeneratedAt(item.generatedAt)} · {formatBytes(item.sizeBytes)}
                </p>
              </div>
            </div>

            <DeliverableDownloadButton item={item} />

            <div className="mt-3 flex flex-wrap gap-2">
              {sourceText?.trim() ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 touch-manipulation"
                  onClick={() => {
                    void navigator.clipboard.writeText(sourceText);
                  }}
                >
                  {ui.work.copy}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11 touch-manipulation"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    typeof window !== "undefined"
                      ? `${window.location.origin}${item.downloadUrl}`
                      : item.downloadUrl,
                  );
                }}
              >
                共有リンクをコピー
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
