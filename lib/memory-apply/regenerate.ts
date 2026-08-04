import "server-only";

import { resolveForContext } from "@/lib/personal-memory/service";
import {
  applyContentOverlayToText,
  buildContentOverlay,
  buildDeliverableOverlay,
} from "@/lib/memory-apply/overlays";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "@/lib/memory-apply/quality-diff";
import type { MemoryDeliverableOverlay, MemoryQualityDiff } from "@/lib/memory-apply/types";

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

  const { result, ledger } = await resolveForContext({
    userId: input.userId,
    notes: input.improvementNotes ?? previous.slice(0, 400),
    artifactTypes: ["docx", "pdf", "xlsx", "pptx"],
  });

  const contentOverlay = buildContentOverlay({
    values: ledger.memoryValuesResolved,
    injectionText: result.injectionText,
  });
  const deliverableOverlay = buildDeliverableOverlay({
    userId: input.userId,
    values: ledger.memoryValuesResolved,
    injectionText: result.injectionText,
    tokenEstimate: result.tokenEstimate,
  });

  // Delta-only: keep previous body; append improvement notes; re-apply signature/style header
  const withNotes = input.improvementNotes?.trim()
    ? `${previous}\n\n【改善点】\n${input.improvementNotes.trim()}`
    : previous;
  const next = applyContentOverlayToText(withNotes, {
    ...contentOverlay,
    // Avoid duplicating a huge injection block on regenerate — keep style bits
    injectionText: contentOverlay.writingStyle
      ? `【文体維持】${contentOverlay.writingStyle}`
      : "",
  });

  const flat: Record<string, unknown> = {};
  for (const row of ledger.memoryValuesResolved) {
    Object.assign(flat, row.value);
  }
  const quality = compareMemoryQuality({
    before: previous,
    after: next,
    memoryMode: ledger.memoryIdsUsed.length > 0 ? "on" : "off",
    expectedMemoryTokens: expectedTokensFromMemoryValues(flat),
  });

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

  const applied = ledger.memoryIdsUsed.length > 0 || Boolean(input.improvementNotes?.trim());

  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "regenerate",
    memoryMode: applied ? "on" : "off",
    applied,
    memoryIdsUsed: ledger.memoryIdsUsed,
    scopesUsed: deliverableOverlay.scopesUsed,
    improvementRate: quality.improvementRate,
    success: true,
  });

  return {
    content: next,
    overlay: deliverableOverlay,
    memoryIdsUsed: ledger.memoryIdsUsed,
    quality,
    preservedLayoutHints,
    applied,
  };
}
