import type {
  CorrectionMetrics,
  MemoryScoreBand,
  MemoryScoreResult,
} from "@/lib/personal-memory/quality/types";

/**
 * Memory Score (0–100)
 *
 * score = 55% match + 35% (1 - diffRate) + 10% applyCoverage
 *
 * Bands:
 * 95+ ほぼ完全一致
 * 80+ 少し修正あり
 * 60+ 改善余地あり
 * 40+ Memory不足
 * <40 ほぼ初回
 */
export function computeMemoryScore(input: {
  overallMatchRate: number;
  correction: CorrectionMetrics;
  /** 0–1 how many preference dimensions had Memory applied */
  applyCoverage: number;
}): MemoryScoreResult {
  const match = clamp01(input.overallMatchRate);
  const fidelity = clamp01(1 - input.correction.diffRate);
  const coverage = clamp01(input.applyCoverage);
  const score = Math.round(
    (match * 0.55 + fidelity * 0.35 + coverage * 0.1) * 100,
  );
  const band = bandForScore(score);
  return {
    score,
    band,
    label: labelForBand(band, score),
  };
}

export function bandForScore(score: number): MemoryScoreBand {
  if (score >= 95) return "near_perfect";
  if (score >= 80) return "minor_edits";
  if (score >= 60) return "room_to_improve";
  if (score >= 40) return "memory_insufficient";
  return "almost_first_run";
}

export function labelForBand(band: MemoryScoreBand, score: number): string {
  switch (band) {
    case "near_perfect":
      return `${score}% · ほぼ完全一致`;
    case "minor_edits":
      return `${score}% · 少し修正あり`;
    case "room_to_improve":
      return `${score}% · 改善余地あり`;
    case "memory_insufficient":
      return `${score}% · Memory不足`;
    default:
      return `${score}% · ほぼ初回`;
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
