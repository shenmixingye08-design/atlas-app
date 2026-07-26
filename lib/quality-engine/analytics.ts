import { getSpecialistProfile, ALL_QUALITY_PROMPT_KINDS } from "./specialists";
import type { QualityEngineLogEntry } from "./telemetry-store";
import type { QualityKindStats, QualityPromptKind } from "./types";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Aggregate owner metrics per specialist / deliverable kind. */
export function buildQualityKindStats(
  entries: readonly QualityEngineLogEntry[],
): QualityKindStats[] {
  const buckets = new Map<
    QualityPromptKind,
    {
      scores: number[];
      improve: number[];
      reviewer: number[];
    }
  >();

  for (const kind of ALL_QUALITY_PROMPT_KINDS) {
    buckets.set(kind, { scores: [], improve: [], reviewer: [] });
  }

  for (const entry of entries) {
    const bucket = buckets.get(entry.promptKind);
    if (!bucket) continue;
    if (typeof entry.finalScore === "number") {
      bucket.scores.push(entry.finalScore);
    }
    bucket.improve.push(entry.improveCount);
    bucket.reviewer.push(entry.reviewerCount ?? (entry.reviewerUsedLlm ? 2 : 1));
  }

  return ALL_QUALITY_PROMPT_KINDS.map((kind) => {
    const bucket = buckets.get(kind)!;
    const specialist = getSpecialistProfile(kind);
    const sampleCount =
      bucket.improve.length || bucket.scores.length || bucket.reviewer.length;
    return {
      promptKind: kind,
      specialistLabel: specialist.label,
      sampleCount,
      avgScore:
        bucket.scores.length > 0
          ? round1(
              bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length,
            )
          : null,
      avgImproveCount:
        bucket.improve.length > 0
          ? round1(
              bucket.improve.reduce((a, b) => a + b, 0) / bucket.improve.length,
            )
          : 0,
      avgReviewerCount:
        bucket.reviewer.length > 0
          ? round1(
              bucket.reviewer.reduce((a, b) => a + b, 0) /
                bucket.reviewer.length,
            )
          : 0,
    };
  }).filter((row) => row.sampleCount > 0);
}
