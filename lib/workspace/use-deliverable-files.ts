"use client";

import { useEffect, useRef, useState } from "react";

import type { Deliverable, DeliverableFormat } from "@/lib/deliverables/types";
import { requestDeliverables } from "@/lib/deliverables/client";
import {
  hashDeliverableText,
  saveDeliverableHistory,
} from "@/lib/deliverables/history-store";
import { getDeliverableExportText } from "@/lib/orchestration/final-deliverable";
import type { OrchestrationResult } from "@/lib/orchestration/types";

export type DeliverableFileOptions = {
  formats?: DeliverableFormat[];
  skipFileGeneration?: boolean;
  /** When set, file metadata is persisted for history re-download. */
  projectId?: string;
};

export function useDeliverableFiles(
  result: OrchestrationResult | null,
  options?: DeliverableFileOptions,
) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [deliverablesError, setDeliverablesError] = useState<string | null>(null);
  const [isGeneratingDeliverables, setIsGeneratingDeliverables] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!result) {
      setDeliverables([]);
      setDeliverablesError(null);
      return;
    }

    const previewContent = result.deliverable
      ? getDeliverableExportText(result.deliverable).trim()
      : "";

    if (!previewContent) {
      setDeliverables([]);
      setDeliverablesError(null);
      return;
    }

    if (options?.skipFileGeneration) {
      setDeliverables([]);
      setDeliverablesError(null);
      setIsGeneratingDeliverables(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGeneratingDeliverables(true);
    setDeliverablesError(null);
    setDeliverables([]);

    const title =
      result.deliverable &&
      typeof result.deliverable === "object" &&
      "title" in result.deliverable
        ? String(result.deliverable.title ?? "").trim() || undefined
        : undefined;

    void requestDeliverables(
      {
        assignment: result.assignment,
        finalDeliverable: previewContent,
        title,
        projectName: result.assignment.trim().slice(0, 80),
        workflowId: result.knowledge?.workflowId,
        formats:
          options?.formats && options.formats.length > 0
            ? options.formats
            : undefined,
      },
      controller.signal,
    )
      .then((response) => {
        setDeliverables(response.deliverables);
        if (options?.projectId && response.deliverables.length > 0) {
          saveDeliverableHistory({
            projectId: options.projectId,
            assignment: result.assignment,
            title: title ?? result.assignment.slice(0, 80),
            contentHash: hashDeliverableText(previewContent),
            deliverables: response.deliverables,
          });
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setDeliverablesError(
          err instanceof Error ? err.message : "ファイル生成に失敗しました",
        );
      })
      .finally(() => {
        setIsGeneratingDeliverables(false);
      });

    return () => controller.abort();
  }, [
    result,
    options?.formats,
    options?.skipFileGeneration,
    options?.projectId,
  ]);

  return { deliverables, deliverablesError, isGeneratingDeliverables };
}

/** Regenerate files from edited export text (no AI / orchestration). */
export async function regenerateDeliverableFiles(input: {
  assignment: string;
  content: string;
  title?: string;
  formats?: DeliverableFormat[];
  projectId?: string;
  signal?: AbortSignal;
}): Promise<Deliverable[]> {
  const response = await requestDeliverables(
    {
      assignment: input.assignment,
      finalDeliverable: input.content,
      title: input.title,
      projectName: input.assignment.trim().slice(0, 80),
      formats: input.formats,
    },
    input.signal,
  );

  if (input.projectId && response.deliverables.length > 0) {
    saveDeliverableHistory({
      projectId: input.projectId,
      assignment: input.assignment,
      title: input.title ?? input.assignment.slice(0, 80),
      contentHash: hashDeliverableText(input.content),
      deliverables: response.deliverables,
    });
  }

  return response.deliverables;
}
