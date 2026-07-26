"use client";

import { useEffect, useRef, useState } from "react";

import type { ArtifactDocument } from "@/lib/artifact-engine/document";
import type { ArtifactSuggestion } from "@/lib/artifact-engine/types";
import {
  DEFAULT_ARTIFACT_TEMPLATE,
  type ArtifactTemplateId,
} from "@/lib/artifact-engine/templates/types";
import type { DocumentOutlineResponse } from "@/lib/deliverables/client";
import { requestDeliverables } from "@/lib/deliverables/client";
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
  const [designTemplate, setDesignTemplate] = useState<ArtifactTemplateId>(
    DEFAULT_ARTIFACT_TEMPLATE,
  );
  const [recommendedTemplate, setRecommendedTemplate] =
    useState<ArtifactTemplateId | null>(null);
  const [artifactLabel, setArtifactLabel] = useState<string | null>(null);
  const [templateLabel, setTemplateLabel] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ArtifactSuggestion[]>([]);
  const [artifactDocument, setArtifactDocument] =
    useState<ArtifactDocument | null>(null);
  const [completionStatus, setCompletionStatus] = useState<
    ArtifactDocument["completionStatus"] | null
  >(null);
  const userPickedTemplateRef = useRef(false);
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
        setArtifactLabel(null);
        setTemplateLabel(null);
        setSuggestions([]);
        setArtifactDocument(null);
        setCompletionStatus(null);
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
            designTemplate: userPickedTemplateRef.current
              ? designTemplate
              : undefined,
          },
          controller.signal,
        );
        if (cancelled) return;
        setDeliverables(response.deliverables);
        setDocumentOutline(response.documentOutline ?? null);
        setArtifactLabel(response.artifactLabel ?? null);
        setTemplateLabel(response.templateLabel ?? null);
        setSuggestions(response.suggestions ?? []);
        setArtifactDocument(response.artifactDocument ?? null);
        setCompletionStatus(response.completionStatus ?? null);

        const serverTemplate =
          response.designTemplate ??
          response.artifactDocument?.designId ??
          DEFAULT_ARTIFACT_TEMPLATE;
        setRecommendedTemplate(serverTemplate);
        if (!userPickedTemplateRef.current) {
          setDesignTemplate(serverTemplate);
        }
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

  const setDesignTemplateFromUser = (template: ArtifactTemplateId) => {
    userPickedTemplateRef.current = true;
    setDesignTemplate(template);
  };

  return {
    deliverables,
    deliverablesError,
    isGeneratingDeliverables,
    documentOutline,
    designTemplate,
    setDesignTemplate: setDesignTemplateFromUser,
    recommendedTemplate,
    artifactLabel,
    templateLabel,
    suggestions,
    artifactDocument,
    completionStatus,
  };
}
