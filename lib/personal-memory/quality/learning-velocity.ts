import type {
  CategoryLearningSeries,
  DeliverableQualityEvaluation,
  LearningVelocityPoint,
} from "@/lib/personal-memory/quality/types";

const STABLE_SCORE = 85;

export function buildLearningVelocity(
  evaluations: DeliverableQualityEvaluation[],
): CategoryLearningSeries[] {
  const byCategory = new Map<string, DeliverableQualityEvaluation[]>();
  for (const row of evaluations) {
    const key = row.workCategory?.trim() || "全体";
    const list = byCategory.get(key) ?? [];
    list.push(row);
    byCategory.set(key, list);
  }

  return [...byCategory.entries()].map(([workCategory, rows]) => {
    const ordered = [...rows].sort((a, b) => {
      const byRun = a.runIndexInCategory - b.runIndexInCategory;
      if (byRun !== 0) return byRun;
      return a.createdAt.localeCompare(b.createdAt);
    });
    const points: LearningVelocityPoint[] = ordered.map((row, index) => ({
      runIndex: row.runIndexInCategory || index + 1,
      memoryScore: row.memoryScore.score,
      diffRate: row.correction.diffRate,
      overallMatchRate: row.overallMatchRate,
      evaluatedAt: row.createdAt,
    }));
    const stableIdx = points.findIndex((p) => p.memoryScore >= STABLE_SCORE);
    return {
      workCategory,
      points,
      runsToStable: stableIdx >= 0 ? stableIdx + 1 : null,
    };
  });
}

/** Proof helpers: score lift / diff drop from first → last in a series */
export function seriesImprovement(series: CategoryLearningSeries): {
  scoreLift: number;
  diffDrop: number;
} | null {
  if (series.points.length < 2) return null;
  const first = series.points[0]!;
  const last = series.points[series.points.length - 1]!;
  return {
    scoreLift: last.memoryScore - first.memoryScore,
    diffDrop: first.diffRate - last.diffRate,
  };
}
