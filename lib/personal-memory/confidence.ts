import type { MemoryConfidenceBand } from "@/lib/personal-memory/types";
import {
  MEMORY_CANDIDATE_CONFIDENCE,
  MEMORY_CONFIRMED_CONFIDENCE,
  MEMORY_LEARNING_CONFIDENCE,
  MEMORY_PROMOTE_CONFIDENCE,
} from "@/lib/personal-memory/types";

export function confidenceBand(confidence: number): MemoryConfidenceBand {
  if (confidence >= MEMORY_CONFIRMED_CONFIDENCE) return "confirmed";
  if (confidence >= MEMORY_CANDIDATE_CONFIDENCE) return "candidate";
  return "learning";
}

export function confidenceLabel(confidence: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  const band = confidenceBand(confidence);
  if (band === "confirmed") return `${pct}% · ほぼ確定`;
  if (band === "candidate") return `${pct}% · 候補`;
  return `${pct}% · まだ学習不足`;
}

export function canPromoteByConfidence(confidence: number): boolean {
  return confidence >= MEMORY_PROMOTE_CONFIDENCE;
}

export function nextConfidenceAfterRepeat(input: {
  previous: number;
  explicit: boolean;
  repeats: number;
}): number {
  if (input.explicit) {
    return Math.min(MEMORY_CONFIRMED_CONFIDENCE, Math.max(0.9, input.previous));
  }
  const bumped = MEMORY_LEARNING_CONFIDENCE + input.repeats * 0.12;
  return Math.min(0.84, Math.max(input.previous, bumped));
}
