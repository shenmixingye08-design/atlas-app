import type { AutomationRun } from "@/lib/automation-platform/types";
import type {
  EvidenceItem,
  ExpectedBenefit,
  WorkflowLearningCandidateType,
  WorkflowLearningPatch,
  WorkflowLearningRiskLevel,
  WorkflowLearningThresholds,
} from "@/lib/workflow-learning/types";

export type FailurePatternHit = {
  type: WorkflowLearningCandidateType;
  summary: string;
  reason: string;
  evidence: EvidenceItem[];
  proposedPatch: WorkflowLearningPatch;
  expectedBenefit: ExpectedBenefit;
  riskLevel: WorkflowLearningRiskLevel;
  confidence: number;
  sourceRunIds: string[];
  fingerprintKey: string;
};

function benefit(
  partial: Partial<ExpectedBenefit>,
): ExpectedBenefit {
  return {
    timeReduction: partial.timeReduction ?? 0,
    costReduction: partial.costReduction ?? 0,
    failureReduction: partial.failureReduction ?? 0,
    manualStepReduction: partial.manualStepReduction ?? 0,
  };
}

export function analyzeFailurePatterns(
  runs: AutomationRun[],
  thresholds: WorkflowLearningThresholds,
): FailurePatternHit[] {
  const completed = [...runs].sort((a, b) =>
    (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt),
  );
  const hits: FailurePatternHit[] = [];

  // Consecutive failures on same step
  const failed = completed.filter((r) => r.status === "failed" && r.failedStepId);
  if (failed.length >= thresholds.consecutiveStepFailures) {
    const byStep = new Map<string, AutomationRun[]>();
    for (const run of failed) {
      const key = run.failedStepId!;
      const list = byStep.get(key) ?? [];
      list.push(run);
      byStep.set(key, list);
    }
    for (const [stepId, list] of byStep) {
      if (list.length < thresholds.consecutiveStepFailures) continue;
      const codes = list.map((r) => r.lastErrorCode ?? "unknown");
      const dominant = mode(codes);
      const stepName =
        list[0]?.steps.find((s) => s.id === stepId)?.name ?? stepId;

      // Never propose step delete for failures — prefer fallback / timeout / reconnect
      if (dominant?.includes("rate_limit") || dominant?.includes("rate-limit")) {
        hits.push({
          type: "schedule_shift",
          summary: `API制限が続いています。実行時刻を30分遅らせる候補があります。`,
          reason: `${list.length}回、同じStep「${stepName}」で制限エラー`,
          evidence: list.slice(0, 5).map((r) => ({
            kind: "run" as const,
            label: r.automationName,
            runId: r.id,
            detail: r.lastErrorCode ?? undefined,
          })),
          proposedPatch: { kind: "schedule_shift_minutes", delayMinutes: 30 },
          expectedBenefit: benefit({ failureReduction: 0.4, timeReduction: 0 }),
          riskLevel: "low",
          confidence: Math.min(0.9, 0.5 + list.length * 0.08),
          sourceRunIds: list.map((r) => r.id),
          fingerprintKey: `fail_rate_limit:${stepId}`,
        });
      } else if (
        dominant?.includes("token") ||
        dominant?.includes("auth") ||
        dominant?.includes("unauthorized")
      ) {
        hits.push({
          type: "failure_fallback",
          summary: `外部連携の認証が失効している可能性があります。再接続後に続行する確認Stepを追加しますか？`,
          reason: `${list.length}回、認証系エラーが「${stepName}」で発生`,
          evidence: list.slice(0, 5).map((r) => ({
            kind: "run" as const,
            label: "認証エラー",
            runId: r.id,
            detail: r.lastErrorCode ?? undefined,
          })),
          proposedPatch: {
            kind: "add_input_check",
            afterStepId: null,
            name: "外部連携の再接続確認",
          },
          expectedBenefit: benefit({
            failureReduction: 0.5,
            manualStepReduction: 0.2,
          }),
          riskLevel: "medium",
          confidence: 0.7,
          sourceRunIds: list.map((r) => r.id),
          fingerprintKey: `fail_auth:${stepId}`,
        });
      } else if (dominant?.includes("timeout")) {
        const currentTimeout = 60_000;
        hits.push({
          type: "timeout",
          summary: `「${stepName}」でタイムアウトが続いています。待ち時間を調整しますか？`,
          reason: `${list.length}回のtimeout`,
          evidence: list.slice(0, 5).map((r) => ({
            kind: "run" as const,
            label: "timeout",
            runId: r.id,
          })),
          proposedPatch: {
            kind: "timeout",
            stepId,
            timeoutMs: Math.min(currentTimeout * 2, 10 * 60_000),
          },
          expectedBenefit: benefit({ failureReduction: 0.35 }),
          riskLevel: "low",
          confidence: 0.65,
          sourceRunIds: list.map((r) => r.id),
          fingerprintKey: `fail_timeout:${stepId}`,
        });
      } else if (
        dominant?.includes("storage") ||
        dominant?.includes("not_found") ||
        dominant?.includes("folder")
      ) {
        hits.push({
          type: "failure_fallback",
          summary: `保存先が見つからない失敗が続いています。次回から親フォルダを確認するStepを入れますか？`,
          reason: `${list.length}回のStorage系失敗`,
          evidence: list.slice(0, 5).map((r) => ({
            kind: "run" as const,
            label: "storage",
            runId: r.id,
            detail: r.lastErrorMessage ?? undefined,
          })),
          proposedPatch: {
            kind: "add_input_check",
            afterStepId: null,
            name: "保存先フォルダの確認",
          },
          expectedBenefit: benefit({
            failureReduction: 0.45,
            manualStepReduction: 0.3,
          }),
          riskLevel: "low",
          confidence: 0.72,
          sourceRunIds: list.map((r) => r.id),
          fingerprintKey: `fail_storage:${stepId}`,
        });
      } else {
        // Retry-after-success pattern: failed then succeeded with retries
        const retrySuccess = completed.filter(
          (r) =>
            r.status === "succeeded" &&
            r.attemptCount > 1 &&
            r.failedStepId === null,
        );
        if (retrySuccess.length >= 2) {
          const sample = retrySuccess[0]!;
          const failingStep =
            sample.steps.find((s) => s.attemptCount > 1) ?? sample.steps[0];
          if (failingStep) {
            // Optimize backoff — NOT blindly increase maxAttempts
            hits.push({
              type: "retry_policy",
              summary: `一時的な障害後に再試行で成功しています。待ち時間（backoff）を調整しますか？`,
              reason: `retry後成功が${retrySuccess.length}回。回数を増やすのではなく間隔を最適化します`,
              evidence: retrySuccess.slice(0, 5).map((r) => ({
                kind: "run" as const,
                label: `attempts=${r.attemptCount}`,
                runId: r.id,
              })),
              proposedPatch: {
                kind: "retry_policy",
                stepId: failingStep.id,
                retryPolicy: {
                  maxAttempts: Math.min(failingStep.attemptCount, 3),
                  backoffMs: [2_000, 8_000, 20_000],
                },
                rationale: "transient_success_backoff",
              },
              expectedBenefit: benefit({
                failureReduction: 0.2,
                timeReduction: 0.1,
              }),
              riskLevel: "low",
              confidence: 0.6,
              sourceRunIds: retrySuccess.map((r) => r.id),
              fingerprintKey: `retry_backoff:${failingStep.id}`,
            });
          }
        }
      }
    }
  }

  // Slow steps (duration outliers)
  const withDuration = completed.filter(
    (r) => typeof r.durationMs === "number" && r.durationMs > 0,
  );
  if (withDuration.length >= 5) {
    const avg =
      withDuration.reduce((s, r) => s + (r.durationMs ?? 0), 0) /
      withDuration.length;
    const slow = withDuration.filter((r) => (r.durationMs ?? 0) > avg * 1.8);
    if (slow.length >= 3) {
      hits.push({
        type: "ai_call_merge",
        summary: `実行時間が平均より長いRunが続いています。重複したAI呼び出しをまとめますか？`,
        reason: `平均${Math.round(avg / 1000)}秒に対し、遅いRunが${slow.length}件`,
        evidence: slow.slice(0, 5).map((r) => ({
          kind: "metric" as const,
          label: `${Math.round((r.durationMs ?? 0) / 1000)}秒`,
          runId: r.id,
        })),
          proposedPatch: {
          kind: "disable_duplicate_step",
          stepId:
            slow[0]?.steps.find((s) => s.capabilityId === "orchestrate")?.id ??
            slow[0]?.steps[0]?.id ??
            "step_unknown",
        },
        expectedBenefit: benefit({
          timeReduction: 0.25,
          costReduction: 0.2,
        }),
        riskLevel: "medium",
        confidence: 0.58,
        sourceRunIds: slow.map((r) => r.id),
        fingerprintKey: `slow_runs`,
      });
    }
  }

  return hits;
}

function mode(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}
