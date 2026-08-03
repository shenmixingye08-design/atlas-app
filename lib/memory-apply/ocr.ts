import "server-only";

import {
  assertMemoryLoadedForAi,
  loadMemory,
  saveMemory,
} from "@/lib/memory-apply/pipeline";
import {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "@/lib/memory-apply/quality-diff";

/**
 * Apply OCR correction dictionary from Personal Memory.
 * Pure correction — no AI.
 */
export function applyOcrCorrections(
  text: string,
  dictionary: Record<string, string>,
): string {
  let next = text;
  const entries = Object.entries(dictionary).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [from, to] of entries) {
    if (!from) continue;
    next = next.split(from).join(to);
  }
  return next;
}

/**
 * Path: loadMemory → PersonalizationContext → OCR dictionary overlay (Fail Closed).
 */
export async function resolveOcrMemoryDictionary(input: {
  userId: string;
}): Promise<{
  dictionary: Record<string, string>;
  memoryIdsUsed: string[];
  injectionText: string;
}> {
  const applied = await loadMemory({
    userId: input.userId,
    channel: "ocr",
    baseline: "OCR correction",
    capabilities: ["ocr"],
    // Shared PersonalizationContext — no OCR-only Memory silo
  });
  assertMemoryLoadedForAi(applied.context);

  return {
    dictionary: applied.context.content.ocrDictionary,
    memoryIdsUsed: applied.context.memoryIdsUsed,
    injectionText:
      applied.prompt.injection.fullText || applied.context.injectionText,
  };
}

export async function correctOcrTextWithMemory(input: {
  userId: string;
  text: string;
}): Promise<{
  original: string;
  corrected: string;
  dictionary: Record<string, string>;
  memoryIdsUsed: string[];
  quality: ReturnType<typeof compareMemoryQuality>;
}> {
  const resolved = await resolveOcrMemoryDictionary({ userId: input.userId });
  const corrected = applyOcrCorrections(input.text, resolved.dictionary);
  const quality = compareMemoryQuality({
    before: input.text,
    after: corrected,
    memoryMode: Object.keys(resolved.dictionary).length > 0 ? "on" : "off",
    expectedMemoryTokens: expectedTokensFromMemoryValues(resolved.dictionary),
  });

  return {
    original: input.text,
    corrected,
    dictionary: resolved.dictionary,
    memoryIdsUsed: resolved.memoryIdsUsed,
    quality,
  };
}

/** Persist OCR correction pairs via shared saveMemory (correction_history). */
export async function saveOcrCorrectionToMemory(input: {
  userId: string;
  from: string;
  to: string;
  context?: string | null;
}): Promise<string | null> {
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from || !to || from === to) return null;

  const saved = await saveMemory({
    userId: input.userId,
    category: "ocr_history",
    channel: "ocr",
    title: "OCR補正辞書",
    summary: `${from} → ${to}`,
    value: {
      from,
      to,
      dictionary: { [from]: to },
      context: input.context ?? null,
      category: "correction_history",
    },
    asCandidate: true,
  });
  return saved.memoryId;
}
