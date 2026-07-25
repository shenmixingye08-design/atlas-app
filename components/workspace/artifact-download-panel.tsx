"use client";

import { useState } from "react";

import { triggerBlobDownload } from "@/lib/browser/trigger-blob-download";
import { downloadDeliverableFile } from "@/lib/deliverables/download-client";
import type { Deliverable as GeneratedFile } from "@/lib/deliverables/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type ArtifactDownloadPanelProps = {
  deliverables: readonly GeneratedFile[];
  isGeneratingDeliverables: boolean;
  exportText: string;
  markdownFileName: string;
  formatsToShow: GeneratedFile["format"][];
  onDriveSave: () => void;
  driveSaved: boolean;
};

const DOWNLOAD_META: Record<
  GeneratedFile["format"],
  { label: string; hint?: string }
> = {
  docx: { label: "Word" },
  pdf: { label: "PDF" },
  xlsx: { label: "Excel" },
  pptx: { label: "PowerPoint" },
  md: { label: "Markdown", hint: "内部管理・編集用" },
  txt: { label: "テキスト" },
};

function findGeneratedFile(
  deliverables: readonly GeneratedFile[],
  format: GeneratedFile["format"],
): GeneratedFile | undefined {
  return deliverables.find((item) => item.format === format);
}

function FormatButton({
  format,
  deliverables,
  isGeneratingDeliverables,
}: {
  format: GeneratedFile["format"];
  deliverables: readonly GeneratedFile[];
  isGeneratingDeliverables: boolean;
}) {
  const file = findGeneratedFile(deliverables, format);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = DOWNLOAD_META[format];

  if (!file) {
    return (
      <Button variant="secondary" size="sm" disabled={isGeneratingDeliverables}>
        {meta.label}
      </Button>
    );
  }

  const handleDownload = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      await downloadDeliverableFile({
        url: file.downloadUrl,
        fileName: file.fileName,
        mimeType: file.mimeType,
      });
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : ui.work.downloadFailed,
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={isGeneratingDeliverables || isDownloading}
        onClick={() => void handleDownload()}
      >
        {isDownloading ? ui.work.downloadingFile : meta.label}
      </Button>
      {error ? (
        <span className="max-w-[16rem] text-xs text-[var(--error)]">{error}</span>
      ) : null}
    </span>
  );
}

/**
 * Organized download actions for finished artifacts.
 * Word / PDF / Excel / PowerPoint / Markdown / Drive.
 */
export function ArtifactDownloadPanel({
  deliverables,
  isGeneratingDeliverables,
  exportText,
  markdownFileName,
  formatsToShow,
  onDriveSave,
  driveSaved,
}: ArtifactDownloadPanelProps) {
  const hasPptx = formatsToShow.includes("pptx");
  const showPptxSoon = !hasPptx;

  const handleMarkdown = () => {
    const blob = new Blob([exportText], {
      type: "text/markdown;charset=utf-8",
    });
    void triggerBlobDownload(blob, markdownFileName);
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {ui.work.downloadSectionTitle}
        </p>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
          {ui.work.downloadSectionHint}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {formatsToShow.map((format) => (
          <FormatButton
            key={format}
            format={format}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
          />
        ))}

        {!formatsToShow.includes("md") ? (
          <Button variant="secondary" size="sm" onClick={handleMarkdown}>
            Markdown
          </Button>
        ) : null}

        {showPptxSoon ? (
          <Button variant="secondary" size="sm" disabled title="今後対応予定">
            PowerPoint（今後）
          </Button>
        ) : null}

        <Button variant="secondary" size="sm" onClick={onDriveSave}>
          {driveSaved ? ui.work.driveSaved : ui.work.saveToDrive}
        </Button>
      </div>
    </div>
  );
}
