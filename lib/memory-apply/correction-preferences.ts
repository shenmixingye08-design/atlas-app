/**
 * TOP3: map extractCorrectionInsights → Personal Memory preference.
 * No new AI extractor — reuse Work Memory correction insights.
 */

import "server-only";

import {
  detectMemoryChannel,
  type MemoryArtifactChannel,
} from "@/lib/memory-apply/channels";
import { ingestCorrectionSignal } from "@/lib/personal-memory/service";
import type { PersonalMemoryRecord } from "@/lib/personal-memory/types";
import {
  extractCorrectionInsights,
  type CorrectionInsight,
} from "@/lib/work-memory/learning";

function hasEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text);
}

export function correctionInsightsToPreferenceText(
  insights: CorrectionInsight,
  after: string,
): string {
  const parts: string[] = [];
  if (insights.lengthDelta === "shorter") parts.push("もっと短くして");
  if (insights.lengthDelta === "longer") parts.push("もう少し詳しく");
  if (insights.structureHints.some((hint) => /減らす/.test(hint))) {
    parts.push("もっと短くして");
  }
  if (/^#{1,3}\s/m.test(after) || /見出し/.test(after)) {
    parts.push("見出しを入れて");
  }
  if (/詳しくは|お問い合わせ|こちらから|今すぐ/.test(after)) {
    parts.push("最後にCTAを入れて");
  }
  if (!hasEmoji(after) && hasEmoji(insights.avoidedExpressions.join(""))) {
    parts.push("絵文字なし");
  }
  if (insights.toneHints.some((hint) => /敬語/.test(hint))) {
    parts.push("丁寧に");
  }
  if (insights.avoidedExpressions.length > 0) {
    const phrase = insights.avoidedExpressions[0]!.slice(0, 40);
    if (phrase && !/詳しくは|見出し/.test(phrase)) {
      parts.push(`この言い回しは嫌`);
    }
  }
  return [...new Set(parts)].join("、");
}

export function isUnambiguousCorrectionPreference(text: string): boolean {
  return /短く|短め|簡潔|箇条書き|結論を|絵文字|見出し|CTA|丁寧|嫌/.test(text);
}

export async function ingestCorrectionInsightsToPersonalMemory(input: {
  userId: string;
  before: string;
  after: string;
  artifactType?: string | null;
  automationId?: string | null;
}): Promise<PersonalMemoryRecord | null> {
  const insights = extractCorrectionInsights(input.before, input.after);
  if (!insights) return null;

  const preferenceText = correctionInsightsToPreferenceText(
    insights,
    input.after,
  );
  if (!preferenceText.trim()) return null;

  const channelHint = input.artifactType
    ? input.artifactType
    : detectMemoryChannel(`${input.before}\n${input.after}`).channel;

  return ingestCorrectionSignal({
    userId: input.userId,
    text: preferenceText,
    before: input.before,
    after: input.after,
    artifactType: channelHint,
    automationId: input.automationId ?? null,
    source: "user_correction",
  });
}

export type { MemoryArtifactChannel };
