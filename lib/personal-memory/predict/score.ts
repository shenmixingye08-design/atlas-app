import type {
  PredictionScoreBand,
  PredictionScoreResult,
} from "@/lib/personal-memory/predict/types";
import { PREDICTION_AUTO_APPLY_THRESHOLD } from "@/lib/personal-memory/predict/types";
import type { MemoryResolveLayer } from "@/lib/personal-memory/types";

/**
 * Prediction Score (0–100) — distinct from Memory Confidence.
 *
 * Inputs are all deterministic (no LLM):
 * - layerPrior: instruction/automation/category/company/global/inference
 * - confidence: stored memory confidence
 * - frequency: evidenceCount / max(evidenceTotal, 1)
 * - rejectionPenalty: prior user rejections of this memory
 */
export function computePredictionScore(input: {
  layer: MemoryResolveLayer;
  confidence: number;
  evidenceCount: number;
  evidenceTotal: number;
  rejectionCount?: number;
  /** Explicit current instruction overrides → force very high when matched */
  fromCurrentInstruction?: boolean;
}): PredictionScoreResult {
  if (input.fromCurrentInstruction) {
    return toResult(97);
  }

  const layerPrior = layerPriorWeight(input.layer);
  const conf = clamp01(input.confidence);
  const freq =
    input.evidenceTotal > 0
      ? clamp01(input.evidenceCount / input.evidenceTotal)
      : clamp01(input.evidenceCount / 5);
  const reject = Math.min(0.5, (input.rejectionCount ?? 0) * 0.15);

  const raw = layerPrior * 0.35 + conf * 0.35 + freq * 0.3 - reject;
  const score = Math.round(clamp01(raw) * 100);
  return toResult(score);
}

export function overallPredictionFromItems(
  scores: number[],
): PredictionScoreResult {
  if (scores.length === 0) return toResult(40);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return toResult(Math.round(avg));
}

export function bandForPredictionScore(score: number): PredictionScoreBand {
  if (score >= 97) return "very_high";
  if (score >= 90) return "high";
  if (score >= 75) return "candidate";
  if (score >= 60) return "confirm_recommended";
  return "do_not_apply";
}

export function labelForPredictionBand(
  band: PredictionScoreBand,
  score: number,
): string {
  switch (band) {
    case "very_high":
      return `${score}% · 非常に高い`;
    case "high":
      return `${score}% · 高い`;
    case "candidate":
      return `${score}% · 候補`;
    case "confirm_recommended":
      return `${score}% · 確認推奨`;
    default:
      return `${score}% · 適用しない`;
  }
}

function toResult(score: number): PredictionScoreResult {
  const band = bandForPredictionScore(score);
  return {
    score,
    band,
    label: labelForPredictionBand(band, score),
    autoApply: score >= PREDICTION_AUTO_APPLY_THRESHOLD * 100,
  };
}

function layerPriorWeight(layer: MemoryResolveLayer): number {
  switch (layer) {
    case "current_instruction":
      return 1;
    case "automation_memory":
    case "automation_override":
    case "automation_config":
      return 0.95;
    case "deliverable_category":
      return 0.88;
    case "company_memory":
      return 0.82;
    case "global_memory":
    case "notes":
      return 0.72;
    case "system_inference":
    case "system_default":
      return 0.55;
    default:
      return 0.5;
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
