import type { AutomationRun } from "@/lib/automation-platform/types";

/**
 * Retention tiers — keep what users need, drop bulky technical detail early.
 *
 * - Run summary: long (default 180 days / max 200)
 * - Technical detail (statusHistory, attempts, long prep): short (30 days)
 * - Artifacts: plan-dependent (kept with summary; URLs may expire externally)
 * - Audit: handled separately in automation audit log
 */
export type AutomationRunRetentionPolicy = {
  maxRunsPerUser: number;
  summaryMaxAgeDays: number;
  technicalDetailMaxAgeDays: number;
  keepFailedExtraDays: number;
};

export const DEFAULT_RUN_RETENTION_POLICY: AutomationRunRetentionPolicy = {
  maxRunsPerUser: 200,
  summaryMaxAgeDays: 180,
  technicalDetailMaxAgeDays: 30,
  keepFailedExtraDays: 60,
};

function ageDays(iso: string, nowMs: number): number {
  return (nowMs - Date.parse(iso)) / (24 * 60 * 60 * 1000);
}

function stripTechnicalDetail(run: AutomationRun): AutomationRun {
  return {
    ...run,
    statusHistory: run.statusHistory.slice(-3),
    attempts: run.attempts.slice(-2),
    preparation: run.preparation
      ? {
          ...run.preparation,
          summary: run.preparation.summary.slice(0, 400),
        }
      : null,
    resultSummary: run.resultSummary?.slice(0, 500) ?? null,
    lastErrorMessage: run.lastErrorMessage?.slice(0, 500) ?? null,
  };
}

export function applyRunRetentionPolicy(
  runs: AutomationRun[],
  policy: AutomationRunRetentionPolicy = DEFAULT_RUN_RETENTION_POLICY,
  nowMs: number = Date.now(),
): AutomationRun[] {
  const sorted = [...runs].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

  const kept: AutomationRun[] = [];
  for (const run of sorted) {
    if (kept.length >= policy.maxRunsPerUser) break;

    const age = ageDays(run.updatedAt, nowMs);
    const isFailed =
      run.status === "failed" || run.status === "partially_succeeded";
    const maxAge =
      policy.summaryMaxAgeDays + (isFailed ? policy.keepFailedExtraDays : 0);
    if (age > maxAge) continue;

    if (age > policy.technicalDetailMaxAgeDays) {
      kept.push(stripTechnicalDetail(run));
    } else {
      kept.push({
        ...run,
        resultSummary: run.resultSummary?.slice(0, 500) ?? null,
        lastErrorMessage: run.lastErrorMessage?.slice(0, 500) ?? null,
        preparation: run.preparation
          ? {
              ...run.preparation,
              summary: run.preparation.summary.slice(0, 2000),
            }
          : null,
      });
    }
  }

  return kept;
}

export function retentionPolicySummary(
  policy: AutomationRunRetentionPolicy = DEFAULT_RUN_RETENTION_POLICY,
): {
  summaryRetention: string;
  technicalRetention: string;
  artifactNote: string;
  auditNote: string;
} {
  return {
    summaryRetention: `実行概要は最大${policy.summaryMaxAgeDays}日（失敗は+${policy.keepFailedExtraDays}日）、件数上限${policy.maxRunsPerUser}`,
    technicalRetention: `詳細技術ログは${policy.technicalDetailMaxAgeDays}日で要約化`,
    artifactNote: "成果物はプランと保存先の設定に従います",
    auditNote: "監査ログは別系統で必要期間保持します",
  };
}
