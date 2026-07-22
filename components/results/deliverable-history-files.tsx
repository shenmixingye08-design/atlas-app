"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getDeliverableHistory,
  type DeliverableHistoryEntry,
} from "@/lib/deliverables/history-store";
import {
  DELIVERABLE_DOWNLOAD_ORDER,
  DELIVERABLE_FORMAT_LABELS,
  type Deliverable,
  type DeliverableFormat,
} from "@/lib/deliverables/types";
import { ui } from "@/lib/i18n";

type DeliverableHistoryFilesProps = {
  projectId: string;
  liveDeliverables?: readonly Deliverable[];
};

const BUSINESS_FORMATS: readonly DeliverableFormat[] = [
  "docx",
  "xlsx",
  "pdf",
  "pptx",
];

function shortLabel(format: DeliverableFormat): string {
  switch (format) {
    case "docx":
      return "Word";
    case "xlsx":
      return "Excel";
    case "pptx":
      return "PowerPoint";
    default:
      return DELIVERABLE_FORMAT_LABELS[format].split(" ")[0] ?? format;
  }
}

function mergeFiles(
  history: DeliverableHistoryEntry | null,
  live: readonly Deliverable[],
): Array<{
  format: DeliverableFormat;
  fileName: string;
  downloadUrl: string;
}> {
  const map = new Map<
    DeliverableFormat,
    { format: DeliverableFormat; fileName: string; downloadUrl: string }
  >();

  for (const file of history?.files ?? []) {
    map.set(file.format, {
      format: file.format,
      fileName: file.fileName,
      downloadUrl: file.downloadUrl,
    });
  }

  // Live downloads win (fresh signed/local URLs)
  for (const file of live) {
    map.set(file.format, {
      format: file.format,
      fileName: file.fileName,
      downloadUrl: file.downloadUrl,
    });
  }

  return DELIVERABLE_DOWNLOAD_ORDER.map((format) => map.get(format)).filter(
    (item): item is { format: DeliverableFormat; fileName: string; downloadUrl: string } =>
      Boolean(item),
  );
}

/**
 * History re-download strip — Word / Excel / PDF / PowerPoint and other
 * generated files can be fetched again without re-running AI.
 */
export function DeliverableHistoryFiles({
  projectId,
  liveDeliverables = [],
}: DeliverableHistoryFilesProps) {
  const history = useMemo(
    () => getDeliverableHistory(projectId),
    [projectId, liveDeliverables],
  );
  const files = useMemo(
    () => mergeFiles(history, liveDeliverables),
    [history, liveDeliverables],
  );

  if (files.length === 0) return null;

  const businessReady = files.filter((file) =>
    BUSINESS_FORMATS.includes(file.format),
  );

  return (
    <Card padding="lg" className="space-y-4 shadow-[var(--shadow-soft)]">
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-accent">
          {ui.secretaryResult.historyFilesHeading}
        </p>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.work.historyRedownloadHint}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {(businessReady.length > 0 ? businessReady : files).map((file) => (
          <a key={file.format} href={file.downloadUrl} download={file.fileName}>
            <Button variant="secondary" size="sm" type="button">
              {shortLabel(file.format)}
            </Button>
          </a>
        ))}
      </div>
    </Card>
  );
}
