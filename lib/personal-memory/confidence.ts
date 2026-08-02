/**
 * Confidence tiers — formal / candidate / suggestion-only.
 */

import {
  MEMORY_CONFIDENCE_CANDIDATE,
  MEMORY_CONFIDENCE_FORMAL,
} from "@/lib/personal-memory/types";

export type MemoryConfidenceTier = "formal" | "candidate" | "suggestion";

export function confidenceTier(confidence: number): MemoryConfidenceTier {
  if (confidence >= MEMORY_CONFIDENCE_FORMAL) return "formal";
  if (confidence >= MEMORY_CONFIDENCE_CANDIDATE) return "candidate";
  return "suggestion";
}

export function confidenceTierLabel(tier: MemoryConfidenceTier): string {
  switch (tier) {
    case "formal":
      return "正式";
    case "candidate":
      return "候補";
    default:
      return "提案のみ";
  }
}

/** Only formal/candidate actives are injectable; suggestions never auto-inject. */
export function isInjectableConfidence(confidence: number): boolean {
  return confidence >= MEMORY_CONFIDENCE_CANDIDATE;
}
