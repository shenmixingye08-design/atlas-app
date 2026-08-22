import "server-only";

import type { VisionStyleSignals } from "@/lib/vision/types";
import { createPersonalMemory, resolveForContext } from "@/lib/personal-memory/service";
import { recordMemoryApplyEvent, recordMemoryUpdateEvent } from "@/lib/memory-apply/metrics";
import { buildContentOverlay } from "@/lib/memory-apply/overlays";

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

  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "vision",
    memoryMode: "on",
    applied: candidateIds.length > 0,
    memoryIdsUsed: candidateIds,
    scopesUsed: ["writing_style", "document_design"],
    success: true,
  });

  return { candidateIds };
}

const FORMAT_HINT_NOISE =
  /今後は|last_export|preferred_formats|成果物形式|\b(excel|xlsx|docx|pptx|powerpoint)\b|エクセル/i;

/** Hints that help OCR/reading without hijacking image-type detection. */
export function visionAnalyzeSafeHints(hints: readonly string[]): string[] {
  return hints.filter((hint) => hint.trim() && !FORMAT_HINT_NOISE.test(hint));
}

/**
 * Resolve prior Vision/OCR reading memory before analysis.
 * Last-export format is intentionally excluded — this request's
 * 「Wordにして」「契約書」 must classify the image, not yesterday's Excel.
 */
export async function resolveVisionMemoryContext(input: {
  userId: string;
}): Promise<{
  injectionText: string;
  hints: string[];
  memoryIdsUsed: string[];
}> {
  const { result, ledger } = await resolveForContext({
    userId: input.userId,
    allowedScopes: [
      "writing_style",
      "document_design",
      "contact_info",
      "work_content_style",
    ],
    capabilities: ["vision", "ocr"],
  });
  const overlay = buildContentOverlay({
    values: ledger.memoryValuesResolved.filter(
      (row) => row.scope !== "preferred_formats" && row.key !== "last_export",
    ),
    injectionText: result.injectionText,
  });
  const hints = visionAnalyzeSafeHints([
    ...overlay.visionHints.filter(
      (hint) => !overlay.preferredFormat || hint !== overlay.preferredFormat,
    ),
    ...overlay.contactLines.slice(0, 5),
    ...(overlay.writingStyle ? [overlay.writingStyle] : []),
  ]);

  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "vision",
    memoryMode: hints.length > 0 ? "on" : "off",
    applied: ledger.memoryIdsUsed.length > 0,
    memoryIdsUsed: ledger.memoryIdsUsed,
    scopesUsed: [...new Set(ledger.memoryValuesResolved.map((v) => v.scope))],
    success: true,
  });

  return {
    injectionText: "",
    hints,
    memoryIdsUsed: ledger.memoryIdsUsed,
  };
}
