export type SecretaryLevel = {
  level: number;
  title: string;
  automationCount: number;
  hoursSaved: number;
  memoryCompletionRate: number;
  progressToNext: number;
  nextLevelAt: number;
};

const LEVEL_TITLES = [
  "見習い秘書",
  "秘書見習い",
  "専属秘書",
  "頼れる秘書",
  "一流秘書",
  "最高秘書",
] as const;

/**
 * Display-only secretary level from existing counts.
 * Not a new game backend — pure presentation of progress.
 */
export function computeSecretaryLevel(input: {
  automationCount: number;
  hoursSaved: number;
  memoryActiveCount: number;
  memoryTargetCount?: number;
}): SecretaryLevel {
  const memoryTarget = input.memoryTargetCount ?? 8;
  const memoryCompletionRate = Math.min(
    1,
    memoryTarget <= 0 ? 0 : input.memoryActiveCount / memoryTarget,
  );

  const score =
    input.automationCount * 12 +
    input.hoursSaved * 8 +
    memoryCompletionRate * 40;

  let level = 1;
  if (score >= 120) level = 6;
  else if (score >= 80) level = 5;
  else if (score >= 50) level = 4;
  else if (score >= 25) level = 3;
  else if (score >= 10) level = 2;

  const thresholds = [0, 10, 25, 50, 80, 120, 180];
  const current = thresholds[level - 1] ?? 0;
  const next = thresholds[level] ?? thresholds[thresholds.length - 1]!;
  const progressToNext =
    next <= current ? 1 : Math.min(1, (score - current) / (next - current));

  return {
    level,
    title: LEVEL_TITLES[level - 1] ?? LEVEL_TITLES[0],
    automationCount: input.automationCount,
    hoursSaved: Math.round(input.hoursSaved * 10) / 10,
    memoryCompletionRate: Math.round(memoryCompletionRate * 100) / 100,
    progressToNext: Math.round(progressToNext * 100) / 100,
    nextLevelAt: next,
  };
}
