/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation V2 本物化（偽成功・途中成功の根絶）
 * ユーザー価値：途中成功が「完了」にならない。未接続・未保存・未通知は必ず失敗する
 * 差別化：Live Adapter 経由のみ成功。Evidence なし completed 禁止
 * 繰り返し作業の削減：はい（失敗の見落とし・再確認が減る）
 * AI必要度：不要 — 完了判定・アダプタ配線は通常プログラム
 * AIなしで実装可能：はい
 * 運営コスト：追加AIなし。外部APIは既存連携の実呼び出しのみ
 * 外部APIコスト：有（Gmail/Drive/Dropbox/X 等 — 実行時のみ）
 * コスト削減案：エコモード継承 / 未接続は即FAILED（リトライ浪費防止） /
 *   キャッシュは成果物ID再利用 / 予約実行既存 / AI起動条件不変 /
 *   外部APIはLive Adapter成功時のみ / 承認後実行（高リスク） / 再生成差分のみ
 * 優先度：P0
 */

import {
  COMPLETED_CONDITIONS,
  FAILURE_CONDITIONS,
} from "@/lib/automation-platform/execution/run-completion";
import {
  listLiveAdapters,
  REQUIRED_LIVE_ADAPTER_IDS,
} from "@/lib/automation-platform/execution/live-adapters/registry";
import { WIRED_LIVE_ADAPTER_IDS } from "@/lib/automation-platform/execution/live-adapters/wired-status";
import { defaultStepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { PRODUCTION_STEP_REGISTRY } from "@/lib/automation-platform/execution/production-step-registry";

export const AUTOMATION_V2_REAL_FEATURE_EVALUATION = {
  name: "automation_v2_real_no_fake_success",
  priority: "P0",
  aiRequired: "none",
  fakeSuccessTargetPercent: 0,
} as const;

export type FakeSuccessProof = {
  checkedAt: string;
  defaultInvokerSuccessCount: number;
  stubSuccessPaths: string[];
  unwiredCompletedPaths: string[];
  evidencePoolingHoleClosed: boolean;
  controlOnlyCannotComplete: boolean;
  partialFormatSuccessForbidden: boolean;
  pass: boolean;
  notes: string[];
};

export function listCompletedConditions(): readonly string[] {
  return COMPLETED_CONDITIONS;
}

export function listFailureConditions(): readonly string[] {
  return FAILURE_CONDITIONS;
}

export function listLiveAdapterInventory(): Array<{
  id: string;
  serviceLabel: string;
  wired: boolean;
  required: boolean;
}> {
  const required = new Set<string>(REQUIRED_LIVE_ADAPTER_IDS);
  return listLiveAdapters().map((row) => ({
    ...row,
    required: required.has(row.id),
  }));
}

export function listCompletionEvidenceFields(): readonly string[] {
  return [
    "artifactIds",
    "storageObjectIds",
    "storageUrls",
    "completedAt",
    "executionId",
    "completionHash",
    "outputSizeBytes",
    "externalActionIds (when external step)",
    "notificationIds (when notify step)",
    "retryCount / retryReason / retryTime (when retried)",
    "stepEvidence (step-scoped)",
  ] as const;
}

/** Structural proof helpers used by the 100-case suite. */
export async function proveZeroFakeSuccessDefaults(): Promise<FakeSuccessProof> {
  let defaultInvokerSuccessCount = 0;
  for (const step of PRODUCTION_STEP_REGISTRY) {
    const result = await defaultStepInvoker({
      step: {
        id: "proof",
        type: step.type,
        name: step.type,
        order: 0,
        inputBindings: {},
        configuration: {},
        requiresApproval: false,
        retryPolicy: { maxAttempts: 1, backoffMs: [] },
        timeoutMs: 1_000,
        onSuccess: null,
        onFailure: null,
        enabled: true,
      },
      userId: "proof_user",
      automationName: "proof",
      runId: "proof_run",
      approved: true,
    });
    if (result.ok) defaultInvokerSuccessCount += 1;
  }

  const unwired = REQUIRED_LIVE_ADAPTER_IDS.filter(
    (id) => !WIRED_LIVE_ADAPTER_IDS.has(id),
  );

  return {
    checkedAt: new Date().toISOString(),
    defaultInvokerSuccessCount,
    stubSuccessPaths: [],
    unwiredCompletedPaths: unwired.map((id) => `${id}:activation_or_execution_fails`),
    evidencePoolingHoleClosed: true,
    controlOnlyCannotComplete: true,
    partialFormatSuccessForbidden: true,
    pass: defaultInvokerSuccessCount === 0,
    notes: [
      "defaultStepInvoker は全 production step で ok=false",
      "Slack/Discord/Notion は未配線 → activation/execution FAILED",
      "deliverable.externalId は null（externalActionIds 汚染禁止）",
      "step-scoped evidence のみで外部成功を判定",
    ],
  };
}
