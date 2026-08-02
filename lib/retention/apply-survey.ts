import { markRetentionDayComplete, saveRetentionSurvey } from "./store";
import { trackRetentionEvent } from "./analytics";
import type { RetentionSurveyAnswers } from "./types";

/**
 * Map 5-second survey into Memory/UI hints without calling AI.
 * Writes retention metadata only — User Profile learning core untouched.
 */
export function applySurveyToRetention(answers: Omit<RetentionSurveyAnswers, "submittedAt">): {
  memoryHint: string;
  uiDensity: "compact" | "guided" | "standard";
  suggestionBias: "automate_more" | "improve_quality" | "keep_simple";
} {
  const submitted: RetentionSurveyAnswers = {
    ...answers,
    submittedAt: new Date().toISOString(),
  };
  saveRetentionSurvey(submitted);
  markRetentionDayComplete(2);
  trackRetentionEvent("retention_survey_submitted", {
    helpful: answers.helpful,
    revision: answers.revision,
    reuse: answers.reuse,
  });

  const memoryHint =
    answers.revision === "heavy"
      ? "初回成果物は修正が多め。トーンと構成を短く具体的に。"
      : answers.revision === "light"
        ? "初回成果物は軽微な修正。現行トーンを維持。"
        : "初回成果物はほぼそのまま使える品質。現行方針を固定。";

  const uiDensity =
    answers.helpful === "no"
      ? "guided"
      : answers.helpful === "yes"
        ? "compact"
        : "standard";

  const suggestionBias =
    answers.reuse === "yes"
      ? "automate_more"
      : answers.revision === "heavy"
        ? "improve_quality"
        : "keep_simple";

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        "atlas-retention-survey-apply-v1",
        JSON.stringify({ memoryHint, uiDensity, suggestionBias, at: submitted.submittedAt }),
      );
    } catch {
      // ignore
    }
  }

  return { memoryHint, uiDensity, suggestionBias };
}
