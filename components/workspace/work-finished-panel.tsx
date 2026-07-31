"use client";

import { useState } from "react";

import { downloadDeliverableFile } from "@/lib/deliverables/download-client";
import type { Deliverable as GeneratedFile } from "@/lib/deliverables/types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { resolveFinalOutputPreview } from "@/lib/orchestration/final-deliverable";
import { triggerBlobDownload } from "@/lib/browser/trigger-blob-download";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type WorkFinishedPanelProps = {
  result: OrchestrationResult;
  deliverables?: GeneratedFile[];
  isGeneratingDeliverables?: boolean;
};

const OPEN_ORDER: GeneratedFile["format"][] = [
  "docx",
  "pdf",
  "xlsx",
  "pptx",
  "md",
];

/**
 * Phase1 Done — job finished, one open action. No review / AI / format lists.
 */
export function WorkFinishedPanel({
  result,
  deliverables = [],
  isGeneratingDeliverables = false,
}: WorkFinishedPanelProps) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryFile = OPEN_ORDER.map((format) =>
    deliverables.find((item) => item.format === format),
  ).find(Boolean);

  const openWork = async () => {
    setError(null);
    setOpening(true);
    try {
      if (primaryFile) {
        await downloadDeliverableFile({
          url: primaryFile.downloadUrl,
          fileName: primaryFile.fileName,
          mimeType: primaryFile.mimeType,
          format: primaryFile.format,
        });
        return;
      }
      const text = resolveFinalOutputPreview(result).content;
      if (text?.trim()) {
        void triggerBlobDownload(
          new Blob([text], { type: "text/plain;charset=utf-8" }),
          "minervot-result.txt",
        );
        return;
      }
      setError(ui.secretaryHome.finishedOpenUnavailable);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setOpening(false);
    }
  };

  return (
    <section className="mx-auto max-w-lg space-y-8 py-16 text-center animate-fade-up">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {ui.secretaryHome.finishedTitle}
        </h2>
        <p className="text-base text-[var(--foreground-muted)] sm:text-lg">
          {ui.secretaryHome.finishedBody}
        </p>
      </div>

      {isGeneratingDeliverables && !primaryFile ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.secretaryProgress.polish}
        </p>
      ) : (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="h-14 min-w-[12rem] rounded-full text-base"
          onClick={() => void openWork()}
          disabled={opening || (isGeneratingDeliverables && !primaryFile)}
          isLoading={opening}
        >
          {ui.secretaryHome.finishedOpen}
        </Button>
      )}

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
    </section>
  );
}
