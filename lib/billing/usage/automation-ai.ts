/**
 * One scheduled / dispatched automation occurrence that actually generates
 * with AI = one ai_runs claim. Retries of the same occurrence reuse the key.
 */

import { aiJobClaimKey, consumeAiJobQuota } from "./ai-job";

export const AUTOMATION_AI_STEP_TYPES = new Set([
  "vision_analysis",
  "ocr",
  "word_generate",
  "excel_generate",
  "pdf_generate",
  "powerpoint_generate",
  "data_extract",
  "deliverable_generate",
]);

export function automationUsesAiGeneration(
  stepTypes: readonly string[],
): boolean {
  return stepTypes.some((type) => AUTOMATION_AI_STEP_TYPES.has(type));
}

export function automationAiOccurrenceClaim(
  userId: string,
  occurrenceKey: string,
): string {
  return aiJobClaimKey("automation", userId, occurrenceKey);
}

export async function consumeAutomationAiOccurrenceOnce(input: {
  userId: string;
  occurrenceKey: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const occurrenceKey = input.occurrenceKey.trim();
  if (!input.userId.trim() || !occurrenceKey) {
    return { ok: false, message: "automation_occurrence_required" };
  }
  const reserved = await consumeAiJobQuota({
    userId: input.userId,
    claimKey: automationAiOccurrenceClaim(input.userId, occurrenceKey),
  });
  if (reserved.ok) return { ok: true };
  if (reserved.reason === "usage_unavailable") {
    return {
      ok: false,
      message: "利用状況を確認できないため、この自動化は実行できません",
    };
  }
  return {
    ok: false,
    message: "利用上限に達したため、この自動化は実行できません",
  };
}
