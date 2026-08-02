import type { AutomationRun } from "@/lib/automation-platform/types";
import type { FailurePatternHit } from "@/lib/workflow-learning/patterns/failures";

/**
 * Cost optimization candidates — never "cheaper by lowering quality".
 * Focus: duplicate AI calls, repeated vision, unused memory flood, excess retries.
 */
export function analyzeCostPatterns(runs: AutomationRun[]): FailurePatternHit[] {
  const hits: FailurePatternHit[] = [];
  if (runs.length < 3) return hits;

  let highTokenRuns = 0;
  let highRetryRuns = 0;
  let visionHeavy = 0;

  for (const run of runs) {
    const tokens = run.memoryUsage?.tokenEstimate ?? 0;
    if (tokens > 6_000) highTokenRuns += 1;
    if (run.attemptCount > 2) highRetryRuns += 1;
    if (
      run.steps.some(
        (s) => s.capabilityId === "vision_analysis" && s.attemptCount > 1,
      )
    ) {
      visionHeavy += 1;
    }
  }

  if (highTokenRuns >= 3) {
    hits.push({
      type: "cost_reduction",
      summary: `記憶の注入量が大きいRunが続いています。必要な範囲だけに絞りますか？（品質は維持）`,
      reason: `${highTokenRuns}回、推定トークンが大きい注入がありました`,
      evidence: runs
        .filter((r) => (r.memoryUsage?.tokenEstimate ?? 0) > 6_000)
        .slice(0, 5)
        .map((r) => ({
          kind: "metric" as const,
          label: `tokens≈${r.memoryUsage?.tokenEstimate ?? 0}`,
          runId: r.id,
        })),
      proposedPatch: {
        kind: "instruction_preference_hint",
        note: "Memory適用範囲を必要なスコープに限定",
      },
      expectedBenefit: {
        timeReduction: 0.05,
        costReduction: 0.3,
        failureReduction: 0,
        manualStepReduction: 0,
      },
      riskLevel: "low",
      confidence: 0.62,
      sourceRunIds: runs.map((r) => r.id),
      fingerprintKey: "cost_memory_scope",
    });
  }

  if (visionHeavy >= 2) {
    hits.push({
      type: "cache_reuse",
      summary: `同じ画像の再解析が疑われます。前回の解析結果を再利用しますか？`,
      reason: `Vision再実行が${visionHeavy}回`,
      evidence: [
        {
          kind: "pattern",
          label: "vision_reanalysis",
          detail: "品質を落とさず再取得を避ける",
        },
      ],
      proposedPatch: {
        kind: "instruction_preference_hint",
        note: "同一添付のVision結果キャッシュを優先",
      },
      expectedBenefit: {
        timeReduction: 0.2,
        costReduction: 0.35,
        failureReduction: 0,
        manualStepReduction: 0,
      },
      riskLevel: "low",
      confidence: 0.6,
      sourceRunIds: runs.map((r) => r.id),
      fingerprintKey: "cost_vision_cache",
    });
  }

  // Excess retries without proposing higher maxAttempts
  if (highRetryRuns >= 3) {
    hits.push({
      type: "retry_policy",
      summary: `再試行が多いRunが続いています。失敗を早めて再接続を促す方がコストを抑えられます。`,
      reason: `attemptCount>2 が${highRetryRuns}回。回数増加は提案しません`,
      evidence: runs
        .filter((r) => r.attemptCount > 2)
        .slice(0, 5)
        .map((r) => ({
          kind: "run" as const,
          label: `attempts=${r.attemptCount}`,
          runId: r.id,
        })),
      proposedPatch: {
        kind: "retry_policy",
        stepId: runs[0]?.steps[0]?.id ?? "step_0",
        retryPolicy: {
          maxAttempts: 2,
          backoffMs: [5_000, 15_000],
        },
        rationale: "early_fail_reconnect_cheaper_than_blind_retry",
      },
      expectedBenefit: {
        timeReduction: 0.15,
        costReduction: 0.25,
        failureReduction: 0,
        manualStepReduction: 0.1,
      },
      riskLevel: "medium",
      confidence: 0.58,
      sourceRunIds: runs.map((r) => r.id),
      fingerprintKey: "cost_early_fail",
    });
  }

  return hits;
}
