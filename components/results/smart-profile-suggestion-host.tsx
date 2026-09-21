"use client";

import { useEffect, useMemo, useState } from "react";

import { SmartProfileQualityCard } from "@/components/results/smart-profile-quality-card";
import { SmartProfileSuggestionSheet } from "@/components/results/smart-profile-suggestion-sheet";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import type { Project } from "@/lib/projects/types";
import {
  analyzeDeliverableForSmartProfile,
  type SmartProfileSuggestionModel,
} from "@/lib/smart-profile-suggestion";

type SmartProfileSuggestionHostProps = {
  project: Project;
};

function emptyModel(): SmartProfileSuggestionModel {
  return {
    shouldShow: false,
    quality: { stars: 1, points: [] },
    suggestions: [],
    missingLabels: [],
  };
}

/**
 * Mounts on the post-completion result screen.
 * Rule-based only — no LLM call. Never blocks the result UI.
 */
export function SmartProfileSuggestionHost({
  project,
}: SmartProfileSuggestionHostProps) {
  const [model, setModel] = useState<SmartProfileSuggestionModel>(emptyModel);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const analysisInput = useMemo(() => {
    const deliverable = project.result?.deliverable ?? null;
    const content = deliverable
      ? [
          deliverable.title,
          deliverable.summary,
          getDeliverablePreviewText(deliverable),
          deliverable.content,
          deliverable.plainText,
        ]
          .filter(Boolean)
          .join("\n")
      : (project.result?.finalResponse ?? "");
    return {
      deliverableType: deliverable?.type ?? "document",
      title: deliverable?.title ?? project.title ?? "",
      content,
      workRequest: project.workRequest ?? "",
    };
  }, [project]);

  useEffect(() => {
    // Defer so the completion content paints first — never feel pushy.
    const timer = window.setTimeout(() => {
      const next = analyzeDeliverableForSmartProfile(analysisInput);
      setModel(next);
      setReady(true);
      if (next.shouldShow) {
        setSheetOpen(true);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [analysisInput]);

  if (!ready || !model.shouldShow) return null;

  return (
    <>
      <SmartProfileQualityCard
        quality={model.quality}
        onOpen={() => setSheetOpen(true)}
      />
      <SmartProfileSuggestionSheet
        open={sheetOpen}
        model={model}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          const next = analyzeDeliverableForSmartProfile(analysisInput, {
            recordObservations: false,
          });
          setModel(next);
          if (!next.shouldShow) setSheetOpen(false);
        }}
      />
    </>
  );
}
