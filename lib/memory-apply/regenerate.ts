import "server-only";

import { applyContentOverlayToText } from "@/lib/memory-apply/overlays";
import {
  assertMemoryLoadedForAi,
  loadMemory,
  saveMemory,
} from "@/lib/memory-apply/pipeline";
import {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "@/lib/memory-apply/quality-diff";
import type {
  MemoryDeliverableOverlay,
  MemoryQualityDiff,
} from "@/lib/memory-apply/types";

export type RegenerateMemoryApplyResult = {
  /** Previous content with only improvement deltas applied — never zero-from-scratch */
  content: string;
  overlay: MemoryDeliverableOverlay;
  memoryIdsUsed: string[];
  quality: MemoryQualityDiff;
  preservedLayoutHints: string[];
  applied: boolean;
};

/**
 * Regenerate with Memory: keep prior body, re-apply style/signature/brand,
 * and fold in explicit improvement notes — never start from empty.
 * Path: loadMemory → PersonalizationContext → PromptBuilder.
 */
export async function applyMemoryForRegenerate(input: {
  userId: string;
  previousContent: string;
  improvementNotes?: string | null;
}): Promise<RegenerateMemoryApplyResult> {
  const previous = (input.previousContent ?? "").trim();
  if (!previous) {
    throw new Error("REGENERATE_REQUIRES_PREVIOUS_CONTENT");
  }

  const withNotes = input.improvementNotes?.trim()
    ? `${previous}\n\n【改善点】\n${input.improvementNotes.trim()}`
    : previous;

  const applied = await loadMemory({
    userId: input.userId,
    channel: "regenerate",
    baseline: withNotes,
    assignment: input.improvementNotes ?? previous.slice(0, 400),
    artifactTypes: ["docx", "pdf", "xlsx", "pptx"],
    capabilities: ["regenerate", "deliverable"],
  });
  assertMemoryLoadedForAi(applied.context);

  // Delta-only: keep previous body; re-apply style header without full injection dump
  const next = applyContentOverlayToText(withNotes, {
    ...applied.context.content,
    injectionText: applied.context.content.writingStyle
      ? `【文体維持】${applied.context.content.writingStyle}`
      : "",
  });

  const flat: Record<string, unknown> = {};
  for (const row of applied.provider.personalValues) {
    Object.assign(flat, row.value);
  }
  const quality = compareMemoryQuality({
    before: previous,
    after: next,
    memoryMode: applied.context.memoryIdsUsed.length > 0 ? "on" : "off",
    expectedMemoryTokens: expectedTokensFromMemoryValues(flat),
  });

  const deliverableOverlay = applied.context.deliverable;
  const preservedLayoutHints = [
    deliverableOverlay.templateId
      ? `template:${deliverableOverlay.templateId}`
      : null,
    deliverableOverlay.brandColorHex
      ? `color:${deliverableOverlay.brandColorHex}`
      : null,
    deliverableOverlay.defaultFont
      ? `font:${deliverableOverlay.defaultFont}`
      : null,
    "layout:preserve_previous_structure",
  ].filter((v): v is string => Boolean(v));

  const appliedFlag =
    applied.context.memoryIdsUsed.length > 0 ||
    Boolean(input.improvementNotes?.trim());

  if (input.improvementNotes?.trim()) {
    try {
      await saveMemory({
        userId: input.userId,
        category: "correction_history",
        channel: "regenerate",
        title: "再生成の修正履歴",
        summary: input.improvementNotes.trim().slice(0, 240),
        value: {
          improvementNotes: input.improvementNotes.trim(),
          memoryIdsUsed: applied.context.memoryIdsUsed,
        },
        asCandidate: true,
      });
    } catch {
      // Fail soft on persist
    }
  }

  return {
    content: next,
    overlay: deliverableOverlay,
    memoryIdsUsed: applied.context.memoryIdsUsed,
    quality,
    preservedLayoutHints,
    applied: appliedFlag,
  };
}
