"use client";

import { useEffect, useRef, useState } from "react";

import type { DocumentOutlineResponse } from "@/lib/deliverables/client";
import { requestDeliverables } from "@/lib/deliverables/client";
import {
  DEFAULT_DESIGN_TEMPLATE,
  type DesignTemplateId,
} from "@/lib/deliverables/document-model";
import type { Deliverable, DeliverableFormat } from "@/lib/deliverables/types";
import { getDeliverableExportText } from "@/lib/orchestration/final-deliverable";
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
  const [documentOutline, setDocumentOutline] =
    useState<DocumentOutlineResponse | null>(null);
  const [designTemplate, setDesignTemplate] = useState<DesignTemplateId>(
    DEFAULT_DESIGN_TEMPLATE,
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    const previewContent = result?.deliverable
      ? getDeliverableExportText(result.deliverable).trim()
      : "";

    void (async () => {
      if (!result || !previewContent || options?.skipFileGeneration) {
        if (cancelled) return;
        setDeliverables([]);
        setDeliverablesError(null);
        setDocumentOutline(null);
        setIsGeneratingDeliverables(false);
        return;
      }

      setIsGeneratingDeliverables(true);
      setDeliverablesError(null);

      try {
        const response = await requestDeliverables(
          {
            assignment: result.assignment,
            finalDeliverable: previewContent,
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
            designTemplate,
          },
          controller.signal,
        );
        if (cancelled) return;
        setDeliverables(response.deliverables);
        setDocumentOutline(response.documentOutline ?? null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setDeliverablesError(
          err instanceof Error ? err.message : "ファイル生成に失敗しました",
        );
      } finally {
        if (!cancelled) setIsGeneratingDeliverables(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [result, options?.formats, options?.skipFileGeneration, designTemplate]);

  return {
    deliverables,
    deliverablesError,
    isGeneratingDeliverables,
    documentOutline,
    designTemplate,
    setDesignTemplate,
  };
}
