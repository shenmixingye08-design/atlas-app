"use client";

import { useState } from "react";

import { triggerBlobDownload } from "@/lib/browser/trigger-blob-download";
import type { ArtifactFormatState } from "@/lib/artifact-engine/document";
import { downloadDeliverableFile } from "@/lib/deliverables/download-client";
import type { Deliverable as GeneratedFile } from "@/lib/deliverables/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type ArtifactDownloadPanelProps = {
  deliverables: readonly GeneratedFile[];
  formatStates: readonly ArtifactFormatState[];
  isGeneratingDeliverables: boolean;
  exportText: string;
  markdownFileName: string;
  onDriveSave: () => void;
  driveSaved: boolean;
};

function findGeneratedFile(
  deliverables: readonly GeneratedFile[],
  format: GeneratedFile["format"],
): GeneratedFile | undefined {
  return deliverables.find((item) => item.format === format);
}

function FormatButton({
  state,
  deliverables,
  isGeneratingDeliverables,
}: {
  state: ArtifactFormatState;
  deliverables: readonly GeneratedFile[];
  isGeneratingDeliverables: boolean;
}) {
  const file = findGeneratedFile(deliverables, state.format);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "not_applicable") {
    return (
      <span className="inline-flex flex-col gap-1">
        <Button variant="secondary" size="sm" disabled>
          {state.purpose}
        </Button>
        <span className="text-[11px] text-[var(--foreground-muted)]">対象外</span>
      </span>
    );
  }

  if (state.status === "failed") {
    return (
      <span className="inline-flex flex-col gap-1">
        <Button variant="secondary" size="sm" disabled>
          {state.purpose}
        </Button>
        <span className="text-[11px] text-[var(--error)]">
          {state.error || "生成失敗"}
        </span>
      </span>
    );
  }

  if (!file) {
    return (
      <Button variant="secondary" size="sm" disabled={isGeneratingDeliverables}>
        {isGeneratingDeliverables ? ui.work.downloadingFile : state.purpose}
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
        variant={state.recommended ? "primary" : "secondary"}
        size="sm"
        disabled={isGeneratingDeliverables || isDownloading}
        onClick={() => void handleDownload()}
      >
        {isDownloading ? ui.work.downloadingFile : state.purpose}
      </Button>
      {error ? (
        <span className="max-w-[16rem] text-xs text-[var(--error)]">{error}</span>
      ) : (
        <span className="text-[11px] text-[var(--foreground-muted)]">
          {state.status === "ready" ? "完成" : state.status}
        </span>
      )}
    </span>
  );
}

/**
 * Download actions — recommended formats first, others collapsed.
 */
export function ArtifactDownloadPanel({
  deliverables,
  formatStates,
  isGeneratingDeliverables,
  exportText,
  markdownFileName,
  onDriveSave,
  driveSaved,
}: ArtifactDownloadPanelProps) {
  const [showOther, setShowOther] = useState(false);
  const recommended = formatStates.filter((state) => state.recommended);
  const other = formatStates.filter((state) => !state.recommended);

  const handleMarkdown = () => {
    const blob = new Blob([exportText], {
      type: "text/markdown;charset=utf-8",
    });
    void triggerBlobDownload(blob, markdownFileName);
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-foreground">ダウンロード</p>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
          推奨形式を優先表示しています。プレビューと同じ品質で出力します。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {recommended.map((state) => (
          <FormatButton
            key={state.format}
            state={state}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
          />
        ))}
      </div>

      {other.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            className="text-xs font-medium text-accent underline-offset-4 hover:underline"
            onClick={() => setShowOther((value) => !value)}
          >
            {showOther ? "その他の形式を閉じる" : "その他の形式"}
          </button>
          {showOther ? (
            <div className="flex flex-wrap gap-2">
              {other.map((state) => (
                <FormatButton
                  key={state.format}
                  state={state}
                  deliverables={deliverables}
                  isGeneratingDeliverables={isGeneratingDeliverables}
                />
              ))}
              {!other.some((state) => state.format === "md") ? (
                <Button variant="secondary" size="sm" onClick={handleMarkdown}>
                  Markdownを保存
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-[var(--border-subtle)] pt-3">
        <Button variant="secondary" size="sm" onClick={onDriveSave}>
          {driveSaved ? ui.work.driveSaved : "Google Driveへ保存"}
        </Button>
      </div>
    </div>
  );
}
