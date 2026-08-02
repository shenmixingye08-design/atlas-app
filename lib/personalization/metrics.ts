import type {
  GenerationApplicationRecord,
  QualityMetrics,
} from "@/lib/personalization/types";

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

/**
 * All metrics here are measured from generation ledgers — never estimated constants.
 */
export function computeQualityMetrics(
  records: GenerationApplicationRecord[],
): QualityMetrics {
  const measured = records.filter((r) => r.scoreKind === "measured");
  const withMemory = measured.filter((r) => r.memoryEnabled);
  const applied = withMemory.filter((r) => r.appliedMemoryIds.length > 0);
  const accepted = measured.filter((r) => r.firstAccept === true);
  const rejectedApps = measured.filter(
    (r) =>
      r.userRating != null &&
      r.userRating <= 2 &&
      r.appliedMemoryIds.length > 0,
  );
  const revised = measured.filter((r) => r.revisionCount > 0);
  const withDiff = measured.filter((r) => r.diffMetrics != null);
  const avgDiff =
    withDiff.length === 0
      ? 0
      : withDiff.reduce(
          (sum, r) => sum + (r.diffMetrics?.normalizedDiffRate ?? 0),
          0,
        ) / withDiff.length;

  const instructionLengths = [...measured]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => r.diffMetrics?.instructionLength)
    .filter((n): n is number => typeof n === "number");
  const firstHalf = instructionLengths.slice(
    0,
    Math.floor(instructionLengths.length / 2),
  );
  const secondHalf = instructionLengths.slice(
    Math.floor(instructionLengths.length / 2),
  );
  const avg = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
  const instructionReductionRate =
    firstHalf.length > 0 && secondHalf.length > 0
      ? Number(
          Math.max(
            0,
            (avg(firstHalf) - avg(secondHalf)) / Math.max(avg(firstHalf), 1),
          ).toFixed(4),
        )
      : 0;

  const reuse = measured.filter((r) => r.appliedMemoryIds.length > 0).length;
  const preferenceHits = measured.filter(
    (r) =>
      r.postRevisionScore != null &&
      r.preGenerationScore != null &&
      r.postRevisionScore >= 0.7,
  );
  const conflicts = measured.filter((r) => r.conflictResolutions.length > 0);
  const overrides = measured.filter(
    (r) => Object.keys(r.explicitOverrides).length > 0,
  );
  const falseApps = measured.filter((r) => {
    // False application: memory applied but preference match collapsed after revision
    if (r.appliedMemoryIds.length === 0) return false;
    if (r.firstAccept === false && (r.postRevisionScore ?? 1) < 0.4) return true;
    if (r.userRating != null && r.userRating <= 1) return true;
    return false;
  });

  return {
    memoryApplicationRate: rate(applied.length, withMemory.length),
    memoryAcceptanceRate: rate(accepted.length, applied.length),
    memoryRejectionRate: rate(rejectedApps.length, applied.length),
    firstAcceptRate: rate(accepted.length, measured.length),
    revisionRate: rate(revised.length, measured.length),
    normalizedDiffRate: Number(avgDiff.toFixed(4)),
    instructionReductionRate,
    reuseRate: rate(reuse, measured.length),
    preferenceMatchRate: rate(preferenceHits.length, measured.length),
    conflictRate: rate(conflicts.length, measured.length),
    overrideRate: rate(overrides.length, measured.length),
    falseApplicationRate: rate(falseApps.length, measured.length),
    kind: "measured",
    sampleSize: measured.length,
  };
}

export function cohortBreakdown(
  records: GenerationApplicationRecord[],
  key: "category" | "artifactType",
): Array<{ key: string; metrics: QualityMetrics }> {
  const groups = new Map<string, GenerationApplicationRecord[]>();
  for (const row of records) {
    const k = (key === "category" ? row.category : row.artifactType) ?? "unknown";
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }
  return [...groups.entries()].map(([groupKey, rows]) => ({
    key: groupKey,
    metrics: computeQualityMetrics(rows),
  }));
}
