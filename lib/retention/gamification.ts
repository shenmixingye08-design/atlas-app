import { isActivationCompleted } from "@/lib/activation/store";
import { getOnboardingState } from "@/lib/onboarding/store";

import { loadRetentionState } from "./store";
import type { RetentionValueStats } from "./types";

const LEVEL_LABELS = [
  "見習い秘書",
  "担当秘書",
  "専属秘書",
  "首席秘書",
  "不可欠な秘書",
] as const;

export function computeSecretaryLevel(input: {
  deliverableCount: number;
  automationSuccessCount: number;
  completedDays: number;
  memoryCompletionPercent: number;
}): { level: number; label: string } {
  let score = 0;
  score += Math.min(input.deliverableCount, 10) * 8;
  score += Math.min(input.automationSuccessCount, 10) * 6;
  score += input.completedDays * 10;
  score += Math.round(input.memoryCompletionPercent * 0.3);

  const level =
    score >= 120 ? 5 : score >= 90 ? 4 : score >= 60 ? 3 : score >= 30 ? 2 : 1;
  return { level, label: LEVEL_LABELS[level - 1]! };
}

export function buildRetentionValueStats(input?: {
  deliverableCount?: number;
  automationSuccessCount?: number;
  memoryCompletionPercent?: number;
}): RetentionValueStats {
  const state = loadRetentionState();
  const onboarding = getOnboardingState();
  const activationDone = isActivationCompleted();

  const deliverableCount =
    input?.deliverableCount ??
    Math.max(state.successDayKeys.length, activationDone ? 1 : 0);

  const automationSuccessCount =
    input?.automationSuccessCount ??
    state.dayPlan.filter((d) => d.day >= 3 && d.completedAt).length +
      (activationDone ? 1 : 0);

  const completedDays = state.dayPlan.filter((d) => d.completedAt).length;
  const memoryCompletionPercent =
    input?.memoryCompletionPercent ??
    (state.dayPlan.find((d) => d.day === 2)?.completedAt
      ? 70
      : state.survey
        ? 40
        : onboarding.firstExperienceCompleted
          ? 20
          : 0);

  // Heuristic only — measured savedMinutes stays null until ops wires real timing.
  const estimatedMinutesSaved =
    deliverableCount * 25 + automationSuccessCount * 15 + completedDays * 10;
  const { level, label } = computeSecretaryLevel({
    deliverableCount,
    automationSuccessCount,
    completedDays,
    memoryCompletionPercent,
  });

  return {
    deliverableCount,
    automationSuccessCount,
    estimatedMinutesSaved,
    estimatedHoursSaved: Math.round((estimatedMinutesSaved / 60) * 10) / 10,
    memoryCompletionPercent,
    secretaryLevel: level,
    secretaryLevelLabel: label,
  };
}
