"use client";

import { useEffect, useRef, useState } from "react";

import type { Deliverable, DeliverableFormat } from "@/lib/deliverables/types";
import {
  requestDeliverables,
  type GenerateDeliverablesResponse,
} from "@/lib/deliverables/client";
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
  const [documentModelId, setDocumentModelId] = useState<string | null>(null);
  const [formatRecommendation, setFormatRecommendation] = useState<
    GenerateDeliverablesResponse["formatRecommendation"] | null
  >(null);
  const [isRerendering, setIsRerendering] = useState(false);
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

    void requestDeliverables(
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
      },
      controller.signal,
    )
      .then((response) => {
        setDeliverables(response.deliverables);
        setDocumentModelId(response.documentModelId ?? null);
        setFormatRecommendation(response.formatRecommendation ?? null);
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
  }, [result, options?.formats, options?.skipFileGeneration]);

  const rerender = async (formats: ("docx" | "pdf" | "xlsx")[]) => {
    if (!documentModelId || !result) return;
    setIsRerendering(true);
    setDeliverablesError(null);
    try {
      const response = await fetch(`/api/documents/${documentModelId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formats,
          assignment: result.assignment,
        }),
      });
      const data = (await response.json()) as {
        deliverables?: Deliverable[];
        error?: string;
        nextStep?: string;
      };
      if (!response.ok) {
        throw new Error(
          [data.error, data.nextStep].filter(Boolean).join(" — ") || "再生成に失敗しました",
        );
      }
      if (data.deliverables) {
        setDeliverables(data.deliverables);
      }
    } catch (err) {
      setDeliverablesError(
        err instanceof Error ? err.message : "再生成に失敗しました",
      );
    } finally {
      setIsRerendering(false);
    }
  };

  return {
    deliverables,
    deliverablesError,
    isGeneratingDeliverables,
    documentModelId,
    formatRecommendation,
    isRerendering,
    rerender,
  };
}
