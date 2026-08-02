import type {
  AutomationScoreBand,
  AutomationStarRating,
} from "@/lib/executive-assistant/types";

/** Map 0–100 automation score → band. */
export function scoreToBand(score: number): AutomationScoreBand {
  if (score >= 95) return "automate_now";
  if (score >= 80) return "candidate";
  if (score >= 60) return "watch";
  return "learning";
}

/** Star priority for automation candidates. */
export function scoreToStars(input: {
  score: number;
  cadence?: "daily" | "weekly" | "monthly" | "ad_hoc";
  correctionRepeats?: number;
}): AutomationStarRating {
  if (input.cadence === "weekly" || input.cadence === "daily") {
    if (input.score >= 90) return 5;
    if (input.score >= 75) return 4;
  }
  if (input.cadence === "monthly" && input.score >= 80) return 4;
  if ((input.correctionRepeats ?? 0) >= 3 && input.score >= 70) return 3;
  if (input.score >= 80) return 3;
  if (input.score >= 60) return 2;
  return 1;
}

export function bandLabel(band: AutomationScoreBand): string {
  switch (band) {
    case "automate_now":
      return "今すぐ自動化推奨";
    case "candidate":
      return "候補";
    case "watch":
      return "様子を見る";
    default:
      return "学習不足";
  }
}

export function starsLabel(stars: AutomationStarRating): string {
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}

/**
 * Compute automation suitability 0–100 from recurrence / usage / freshness.
 */
export function computeAutomationScore(input: {
  occurrenceCount: number;
  cadence?: "daily" | "weekly" | "monthly" | "ad_hoc";
  daysSinceLast?: number | null;
  hasFailurePattern?: boolean;
  userConfirmedMemory?: boolean;
  correctionRepeats?: number;
}): number {
  let score = 40;
  const n = input.occurrenceCount;
  if (n >= 8) score += 30;
  else if (n >= 5) score += 22;
  else if (n >= 3) score += 14;
  else if (n >= 2) score += 6;

  if (input.cadence === "daily") score += 18;
  else if (input.cadence === "weekly") score += 22;
  else if (input.cadence === "monthly") score += 14;
  else score += 4;

  if (input.userConfirmedMemory) score += 8;
  if ((input.correctionRepeats ?? 0) >= 3) score += 10;
  if ((input.correctionRepeats ?? 0) >= 5) score += 6;

  if (input.daysSinceLast != null) {
    if (input.daysSinceLast <= 7) score += 6;
    else if (input.daysSinceLast > 45) score -= 12;
  }

  if (input.hasFailurePattern) score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}
