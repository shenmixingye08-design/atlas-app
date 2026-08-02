import "server-only";

import { listVisionCostRecordsForAdmin } from "@/lib/vision/cost";
import { listAllVisionDiagnosticsForAdmin } from "@/lib/vision/diagnostics";

export type VisionAdminMetrics = {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  temporaryErrorCount: number;
  analysisFailureCount: number;
  /** 0–1, or null when no attempts. */
  successRate: number | null;
  /** Average durationMs across recorded cost rows. */
  averageResponseMs: number | null;
  /** Average durationMs for successful analyses only. */
  averageSuccessResponseMs: number | null;
  rateLimitCount: number;
  networkCount: number;
  windowStartedAt: string | null;
  windowEndedAt: string | null;
};

/**
 * Owner metrics: timeout件数 / 平均応答時間 / 成功率.
 * Built from in-memory cost ledger + diagnostic error codes (no PII).
 */
export function buildVisionAdminMetrics(input?: {
  sinceMs?: number;
}): VisionAdminMetrics {
  const sinceMs = input?.sinceMs ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
  const costs = listVisionCostRecordsForAdmin().filter((row) => {
    const t = new Date(row.createdAt).getTime();
    return Number.isFinite(t) && t >= sinceMs;
  });
  const diagnostics = listAllVisionDiagnosticsForAdmin().filter((row) => {
    const t = new Date(row.updatedAt).getTime();
    return Number.isFinite(t) && t >= sinceMs;
  });

  let successCount = 0;
  let failureCount = 0;
  let durationSum = 0;
  let durationN = 0;
  let successDurationSum = 0;
  let successDurationN = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const row of costs) {
    if (row.success) successCount += 1;
    else failureCount += 1;
    if (typeof row.durationMs === "number" && row.durationMs >= 0) {
      durationSum += row.durationMs;
      durationN += 1;
      if (row.success) {
        successDurationSum += row.durationMs;
        successDurationN += 1;
      }
    }
    if (!earliest || row.createdAt < earliest) earliest = row.createdAt;
    if (!latest || row.createdAt > latest) latest = row.createdAt;
  }

  let timeoutCount = 0;
  let rateLimitCount = 0;
  let networkCount = 0;
  let temporaryErrorCount = 0;
  let analysisFailureCount = 0;

  for (const row of diagnostics) {
    const code = (row.lastErrorCode ?? "").toLowerCase();
    const userCode = (row.lastUserCode ?? "").toLowerCase();
    const timedOut = row.stages.some(
      (stage) =>
        !stage.ok &&
        (stage.detail?.timedOut === true ||
          stage.detail?.errorCode === "timeout" ||
          stage.detail?.errorKind === "temporary"),
    );
    if (code === "timeout" || userCode === "vision_temporary_error" || timedOut) {
      timeoutCount += 1;
      temporaryErrorCount += 1;
      continue;
    }
    if (code === "rate_limited" || userCode === "rate_limit") {
      rateLimitCount += 1;
      temporaryErrorCount += 1;
      continue;
    }
    if (code === "network" || userCode === "network") {
      networkCount += 1;
      temporaryErrorCount += 1;
      continue;
    }
    if (row.analysisSuccess === false) {
      analysisFailureCount += 1;
    }
  }

  // Prefer diagnostic timeout counts; fall back to cost failures with zero tokens + long duration.
  if (timeoutCount === 0 && costs.length > 0) {
    for (const row of costs) {
      if (!row.success && row.durationMs >= 50_000) {
        timeoutCount += 1;
      }
    }
  }

  const totalAttempts = successCount + failureCount;
  return {
    totalAttempts,
    successCount,
    failureCount,
    timeoutCount,
    temporaryErrorCount,
    analysisFailureCount,
    successRate: totalAttempts > 0 ? successCount / totalAttempts : null,
    averageResponseMs: durationN > 0 ? durationSum / durationN : null,
    averageSuccessResponseMs:
      successDurationN > 0 ? successDurationSum / successDurationN : null,
    rateLimitCount,
    networkCount,
    windowStartedAt: earliest,
    windowEndedAt: latest,
  };
}
