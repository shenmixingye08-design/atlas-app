"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Deliverable, DeliverableFormat } from "@/lib/deliverables/types";
import { requestDeliverables } from "@/lib/deliverables/client";
import { getDeliverableExportText } from "@/lib/orchestration/final-deliverable";
import { assertSafeExportText } from "@/lib/orchestration/normalize-deliverable-payload";
import type { OrchestrationResult } from "@/lib/orchestration/types";

export type DeliverableFileOptions = {
  formats?: DeliverableFormat[];
  skipFileGeneration?: boolean;
};

export function useDeliverableFiles(
  result: OrchestrationResult | null,
  options?: DeliverableFileOptions,
) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [deliverablesError, setDeliverablesError] = useState<string | null>(null);
  const [isGeneratingDeliverables, setIsGeneratingDeliverables] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const exportGuard = useMemo(() => {
    if (!result?.deliverable) {
      return { previewContent: "", guardError: null as string | null };
    }
    const rawExport = getDeliverableExportText(result.deliverable).trim();
    if (!rawExport) {
      return { previewContent: "", guardError: null as string | null };
    }
    const guarded = assertSafeExportText(rawExport);
    if (!guarded.ok) {
      return { previewContent: "", guardError: guarded.safeMessage };
    }
    return { previewContent: guarded.text, guardError: null as string | null };
  }, [result]);

  const shouldGenerate = Boolean(
    result &&
      exportGuard.previewContent &&
      !options?.skipFileGeneration,
  );

  useEffect(() => {
    if (!shouldGenerate || !result || !exportGuard.previewContent) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      setIsGeneratingDeliverables(true);
      setDeliverablesError(null);
      setDeliverables([]);

      try {
        const response = await requestDeliverables(
          {
            assignment: result.assignment,
            finalDeliverable: exportGuard.previewContent,
            title:
              result.deliverable &&
              typeof result.deliverable === "object" &&
              "title" in result.deliverable
                ? String(result.deliverable.title ?? "").trim() || undefined
                : undefined,
            projectName: result.assignment.trim().slice(0, 80),
            workflowId: result.knowledge?.workflowId,
            formats:
              options?.formats && options.formats.length > 0
                ? options.formats
                : undefined,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setDeliverables(response.deliverables);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setDeliverablesError(
          err instanceof Error ? err.message : "ファイル生成に失敗しました",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsGeneratingDeliverables(false);
        }
      }
    })();

    return () => controller.abort();
  }, [
    shouldGenerate,
    result,
    exportGuard.previewContent,
    options?.formats,
    options?.skipFileGeneration,
  ]);

  if (!shouldGenerate) {
    return {
      deliverables: [] as Deliverable[],
      deliverablesError: exportGuard.guardError,
      isGeneratingDeliverables: false,
    };
  }

  return { deliverables, deliverablesError, isGeneratingDeliverables };
}
