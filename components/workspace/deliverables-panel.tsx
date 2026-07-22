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
  matchedRule: string | null;
};

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
    <div className="mt-6 space-y-2">
      <Button
        variant="primary"
        size="lg"
        className="w-full"
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
}: DeliverablesPanelProps) {
  if (!isGenerating && deliverables.length === 0 && !error) {
    return null;
  }

  return (
    <section className="space-y-8 animate-fade-in" aria-labelledby="deliverables-heading">
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
            <div className="rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-6 py-12 text-center">
              <p className="text-sm text-[var(--foreground-muted)]">
                {DELIVERABLE_FORMAT_LABELS[item.format]}
              </p>
              <p className="mt-2 text-base font-medium text-foreground truncate">
                {item.fileName}
              </p>
            </div>

            <DeliverableDownloadButton item={item} />
          </Card>
        ))}
      </div>
    </section>
  );
}
