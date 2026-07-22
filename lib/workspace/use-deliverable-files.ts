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
  const requestKey = [
    result?.workflow?.workflowId ?? "",
    result?.assignment ?? "",
    options?.formats?.join(",") ?? "",
    options?.skipFileGeneration ? "1" : "0",
    options?.projectId ?? "",
  ].join("|");

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();

    if (!result || options?.skipFileGeneration) {
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        setDeliverables([]);
        setDeliverablesError(null);
        setIsGeneratingDeliverables(false);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    const previewContent = result.deliverable
      ? getDeliverableExportText(result.deliverable).trim()
      : "";

    if (!previewContent) {
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        setDeliverables([]);
        setDeliverablesError(null);
        setIsGeneratingDeliverables(false);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const title =
      result.deliverable &&
      typeof result.deliverable === "object" &&
      "title" in result.deliverable
        ? String(result.deliverable.title ?? "").trim() || undefined
        : undefined;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setIsGeneratingDeliverables(true);
      setDeliverablesError(null);
      setDeliverables([]);

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
          if (cancelled) return;
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
          if (cancelled) return;
          if (err instanceof Error && err.name === "AbortError") return;
          setDeliverablesError(
            err instanceof Error ? err.message : "ファイル生成に失敗しました",
          );
        })
        .finally(() => {
          if (!cancelled) setIsGeneratingDeliverables(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
    // requestKey captures result + options used above
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable request fingerprint
  }, [requestKey]);

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
