import "server-only";

import { createPersonalMemory, resolveForContext } from "@/lib/personal-memory/service";
import { buildContentOverlay } from "@/lib/memory-apply/overlays";
import { recordMemoryApplyEvent, recordMemoryUpdateEvent } from "@/lib/memory-apply/metrics";
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

export async function resolveOcrMemoryDictionary(input: {
  userId: string;
}): Promise<{
  dictionary: Record<string, string>;
  memoryIdsUsed: string[];
  injectionText: string;
}> {
  const { result, ledger } = await resolveForContext({
    userId: input.userId,
    allowedScopes: [
      "contact_info",
      "work_content_style",
      "writing_style",
      "customer_info",
    ],
    capabilities: ["ocr"],
  });
  const overlay = buildContentOverlay({
    values: ledger.memoryValuesResolved,
    injectionText: result.injectionText,
  });

  // Contact fields also act as preferred spellings
  for (const line of overlay.contactLines) {
    const parts = line.split(":").map((p) => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      // Do not invent reverse mappings for labels; only use structured dict.
    }
  }

  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "ocr",
    memoryMode: Object.keys(overlay.ocrDictionary).length > 0 ? "on" : "off",
    applied: Object.keys(overlay.ocrDictionary).length > 0,
    memoryIdsUsed: ledger.memoryIdsUsed,
    scopesUsed: [...new Set(ledger.memoryValuesResolved.map((v) => v.scope))],
    success: true,
  });

  return {
    dictionary: overlay.ocrDictionary,
    memoryIdsUsed: ledger.memoryIdsUsed,
    injectionText: result.injectionText,
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

  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "ocr",
    memoryMode: Object.keys(resolved.dictionary).length > 0 ? "on" : "off",
    applied: corrected !== input.text || Object.keys(resolved.dictionary).length > 0,
    memoryIdsUsed: resolved.memoryIdsUsed,
    improvementRate: quality.improvementRate,
    success: true,
  });

  return {
    original: input.text,
    corrected,
    dictionary: resolved.dictionary,
    memoryIdsUsed: resolved.memoryIdsUsed,
    quality,
  };
}

/** Persist OCR correction pairs as a candidate dictionary entry. */
export async function saveOcrCorrectionToMemory(input: {
  userId: string;
  from: string;
  to: string;
  context?: string | null;
}): Promise<string | null> {
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from || !to || from === to) return null;

  const row = await createPersonalMemory(input.userId, {
    kind: "work_preference",
    scope: "work_content_style",
    key: "ocr_dictionary",
    title: "OCR補正辞書",
    summary: `${from} → ${to}`,
    value: {
      from,
      to,
      dictionary: { [from]: to },
      context: input.context ?? null,
    },
    source: "user_correction",
    status: "candidate",
    confidence: 0.6,
  });
  recordMemoryUpdateEvent(input.userId, 1);
  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "ocr",
    memoryMode: "on",
    applied: true,
    memoryIdsUsed: [row.id],
    scopesUsed: ["work_content_style"],
    success: true,
  });
  return row.id;
}
