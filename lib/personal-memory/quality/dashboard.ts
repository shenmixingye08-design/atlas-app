import type { PersonalMemoryRecord } from "@/lib/personal-memory/types";
import {
  buildLearningVelocity,
  seriesImprovement,
} from "@/lib/personal-memory/quality/learning-velocity";
import { emptyMatchRates } from "@/lib/personal-memory/quality/match-rate";
import type {
  DeliverableKind,
  DeliverableQualityEvaluation,
  MatchRateBreakdown,
  MemoryQualityDashboard,
} from "@/lib/personal-memory/quality/types";
import type { MemoryImprovementSuggestion } from "@/lib/personal-memory/types";

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function averageMatchBreakdown(
  rows: DeliverableQualityEvaluation[],
): MatchRateBreakdown {
  const keys = Object.keys(emptyMatchRates()) as Array<keyof MatchRateBreakdown>;
  const out = emptyMatchRates();
  for (const key of keys) {
    const values = rows
      .map((r) => r.matchRates[key])
      .filter((v): v is number => typeof v === "number");
    out[key] = values.length ? avg(values) : null;
  }
  return out;
}

export function buildMemoryQualityDashboard(input: {
  evaluations: DeliverableQualityEvaluation[];
  memories: PersonalMemoryRecord[];
  suggestions: MemoryImprovementSuggestion[];
}): MemoryQualityDashboard {
  const evaluations = [...input.evaluations].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const latest = evaluations[0] ?? null;
  const scores = evaluations.map((e) => e.memoryScore.score);
  const diffs = evaluations.map((e) => e.correction.diffRate);
  const matches = evaluations.map((e) => e.overallMatchRate);
  const confidences = evaluations.map((e) => e.appliedConfidence);

  const applyRate = {
    totalApplied: evaluations.reduce(
      (s, e) => s + e.memoryApplied.totalApplied,
      0,
    ),
    byCategory: evaluations.reduce((s, e) => s + e.memoryApplied.byCategory, 0),
    byAutomation: evaluations.reduce(
      (s, e) => s + e.memoryApplied.byAutomation,
      0,
    ),
    byCompany: evaluations.reduce((s, e) => s + e.memoryApplied.byCompany, 0),
    byArtifact: evaluations.reduce((s, e) => s + e.memoryApplied.byArtifact, 0),
    byGlobal: evaluations.reduce((s, e) => s + e.memoryApplied.byGlobal, 0),
  };

  const recentLearned = input.memories
    .filter((m) => m.status === "candidate" || m.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8)
    .map((m) => ({
      title: m.title,
      summary: m.summary,
      scope: m.scope,
      status: m.status as "candidate" | "active",
      confidence: m.confidence,
      updatedAt: m.updatedAt,
    }));

  const improvementSuggestions = evaluations
    .filter(
      (e) =>
        e.memoryScore.band === "memory_insufficient" ||
        e.memoryScore.band === "almost_first_run" ||
        e.memoryScore.score < 60,
    )
    .slice(0, 3)
    .map((e) => ({
      id: `quality_${e.id}`,
      title: `${e.workCategory ?? "成果物"}の Memory が不足しています`,
      description: `直近の Memory Score は ${e.memoryScore.label}（Diff率 ${(e.correction.diffRate * 100).toFixed(0)}%）。標準設定を追加しますか？`,
      reason: "memory_insufficient" as const,
    }));

  // Merge rule-based suggestions only when quality is insufficient
  if (improvementSuggestions.length > 0) {
    for (const s of input.suggestions.slice(0, 3)) {
      improvementSuggestions.push({
        id: s.id,
        title: s.title,
        description: s.description,
        reason: "high_repeat_correction",
      });
    }
  }

  const learningVelocity = buildLearningVelocity(evaluations);
  const lifts = learningVelocity
    .map(seriesImprovement)
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const byKindMap = new Map<DeliverableKind, DeliverableQualityEvaluation[]>();
  for (const row of evaluations) {
    const list = byKindMap.get(row.deliverableKind) ?? [];
    list.push(row);
    byKindMap.set(row.deliverableKind, list);
  }

  const byAutomationMap = new Map<string, DeliverableQualityEvaluation[]>();
  for (const row of evaluations) {
    if (!row.automationId) continue;
    const list = byAutomationMap.get(row.automationId) ?? [];
    list.push(row);
    byAutomationMap.set(row.automationId, list);
  }

  return {
    generatedAt: new Date().toISOString(),
    latestScore: latest?.memoryScore ?? null,
    averageScore: avg(scores),
    averageDiffRate: avg(diffs),
    averageMatchRate: avg(matches),
    averageConfidence: avg(confidences),
    applyRate,
    recentLearned,
    improvementSuggestions: improvementSuggestions.slice(0, 6),
    matchRates: averageMatchBreakdown(evaluations),
    learningVelocity,
    byDeliverableKind: [...byKindMap.entries()].map(([kind, rows]) => ({
      kind,
      count: rows.length,
      averageScore: avg(rows.map((r) => r.memoryScore.score)) ?? 0,
      averageDiffRate: avg(rows.map((r) => r.correction.diffRate)) ?? 0,
      averageMatchRate: avg(rows.map((r) => r.overallMatchRate)) ?? 0,
      averageConfidence: avg(rows.map((r) => r.appliedConfidence)) ?? 0,
    })),
    byAutomation: [...byAutomationMap.entries()].map(([automationId, rows]) => ({
      automationId,
      count: rows.length,
      averageScore: avg(rows.map((r) => r.memoryScore.score)) ?? 0,
      averageDiffRate: avg(rows.map((r) => r.correction.diffRate)) ?? 0,
    })),
    evaluationsCount: evaluations.length,
    proof: {
      categoriesImproved: lifts.filter((l) => l.scoreLift > 0 && l.diffDrop > 0)
        .length,
      categoriesMeasured: lifts.length,
      averageScoreLift: avg(lifts.map((l) => l.scoreLift)),
      averageDiffRateDrop: avg(lifts.map((l) => l.diffDrop)),
    },
  };
}
