import "server-only";

import type { VisionStyleSignals } from "@/lib/vision/types";
import { createPersonalMemory } from "@/lib/personal-memory/service";
import {
  recordMemoryApplyEvent,
  recordMemoryUpdateEvent,
} from "@/lib/memory-apply/metrics";
import {
  assertMemoryLoadedForAi,
  loadMemory,
} from "@/lib/memory-apply/pipeline";

/**
 * Convert Vision style signals into Personal Memory candidates (approval required).
 * Never auto-activates. Never writes User Profile core.
 */
export async function createVisionStyleMemoryCandidates(input: {
  userId: string;
  signals: VisionStyleSignals;
  sourceAttachmentIds: string[];
  note?: string | null;
}): Promise<{ candidateIds: string[] }> {
  const candidateIds: string[] = [];
  const baseEvidence = {
    kind: "import" as const,
    summary: "Vision style reference (pending approval)",
    occurredAt: new Date().toISOString(),
  };

  const writingBits = [
    input.signals.tone,
    input.signals.politeness,
    input.signals.sentenceLength,
    ...(input.signals.frequentPhrases ?? []),
  ]
    .filter(Boolean)
    .join(" / ");

  if (writingBits) {
    const row = await createPersonalMemory(input.userId, {
      kind: "user_preference",
      scope: "writing_style",
      key: "vision_style",
      title: "Visionから提案された文体",
      summary: writingBits.slice(0, 160),
      value: {
        tone: input.signals.tone,
        politeness: input.signals.politeness,
        sentenceLength: input.signals.sentenceLength,
        frequentPhrases: input.signals.frequentPhrases ?? [],
        ctaStyle: input.signals.ctaStyle,
        forbiddenCandidates: input.signals.forbiddenCandidates ?? [],
        sourceAttachmentIds: input.sourceAttachmentIds,
        note: input.note ?? null,
      },
      source: "system_inference",
      status: "candidate",
      confidence: 0.55,
      evidence: [baseEvidence],
    });
    candidateIds.push(row.id);
  }

  const designBits = [
    input.signals.headingStyle,
    input.signals.structure,
    input.signals.designTendency,
  ]
    .filter(Boolean)
    .join(" / ");

  if (designBits) {
    const row = await createPersonalMemory(input.userId, {
      kind: "user_preference",
      scope: "document_design",
      key: "vision_layout",
      title: "Visionから提案されたレイアウト",
      summary: designBits.slice(0, 160),
      value: {
        headingStyle: input.signals.headingStyle,
        structure: input.signals.structure,
        designTendency: input.signals.designTendency,
        sourceAttachmentIds: input.sourceAttachmentIds,
      },
      source: "system_inference",
      status: "candidate",
      confidence: 0.5,
      evidence: [baseEvidence],
    });
    candidateIds.push(row.id);
  }

  if (candidateIds.length > 0) {
    recordMemoryUpdateEvent(input.userId, candidateIds.length);
  }

  // Candidate write is not apply — do not mark vision channel applied here.
  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "dashboard",
    memoryMode: "on",
    applied: candidateIds.length > 0,
    memoryIdsUsed: candidateIds,
    scopesUsed: ["writing_style", "document_design"],
    success: true,
  });

  return { candidateIds };
}

/**
 * Resolve prior Vision/OCR format memory before analysis.
 * Path: loadMemory → PersonalizationContext → PromptBuilder (Fail Closed).
 */
export async function resolveVisionMemoryContext(input: {
  userId: string;
}): Promise<{
  injectionText: string;
  hints: string[];
  memoryIdsUsed: string[];
}> {
  const applied = await loadMemory({
    userId: input.userId,
    channel: "vision",
    baseline: "Vision analysis",
    capabilities: ["vision", "ocr"],
    // Shared PersonalizationContext — no Vision-only Memory silo
  });
  assertMemoryLoadedForAi(applied.context);

  const hints = [
    ...applied.context.content.visionHints,
    ...applied.context.content.contactLines.slice(0, 5),
    ...(applied.context.content.writingStyle
      ? [applied.context.content.writingStyle]
      : []),
  ];

  return {
    injectionText:
      applied.prompt.injection.fullText || applied.context.injectionText,
    hints,
    memoryIdsUsed: applied.context.memoryIdsUsed,
  };
}
