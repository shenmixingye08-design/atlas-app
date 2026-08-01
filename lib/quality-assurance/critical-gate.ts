import type { CriticalFinding } from "@/lib/quality-assurance/types";

function finding(
  partial: Omit<CriticalFinding, "severity" | "blocksRelease"> & {
    blocksRelease?: boolean;
  }
): CriticalFinding {
  return {
    ...partial,
    severity: "Critical",
    blocksRelease: partial.blocksRelease ?? true,
  };
}

/**
 * Phase4 Critical Gate — 1件でもあればリリース不可。
 * 静的監査（コード/設計上の既知リスク）+ ランタイム信号を合成する。
 */
export function collectStaticCriticalFindings(opts?: {
  visionTimeoutUnmitigated?: boolean;
  billingGapsOpen?: boolean;
  authzGlobalStores?: boolean;
  productionNotVerified?: boolean;
}): CriticalFinding[] {
  const now = new Date().toISOString();
  const findings: CriticalFinding[] = [];

  if (opts?.authzGlobalStores !== false) {
    findings.push(
      finding({
        id: "authz_global_knowledge_company",
        category: "authz_leak",
        title: "権限漏れリスク: knowledge/company がユーザー非スコープ",
        detail:
          "knowledge/company/marketplace がユーザー非スコープの場合、マルチテナント本番で権限漏れになり得る。Phase4 suite でテナント隔離を証明すること。",
        evidenceRefs: [
          "lib/knowledge/repositories/server-knowledge-repository.ts",
          "lib/company-templates/store.ts",
          "lib/workflow-marketplace/installed-store.ts",
          "lib/release-blocker/",
        ],
        detectedAt: now,
      })
    );
  }

  if (opts?.billingGapsOpen !== false) {
    findings.push(
      finding({
        id: "billing_gap_heavy_routes",
        category: "billing_mismatch",
        title: "課金不整合: 重量ルートのクォータ未統一",
        detail:
          "Vision / PPTX / Excel / artifacts convert 等で request-quota 未適用の経路が残る可能性。有料公開前に統一必須。",
        evidenceRefs: [
          "app/api/vision/analyze/route.ts",
          "app/api/generate/powerpoint/route.ts",
          "app/api/generate/excel/route.ts",
        ],
        detectedAt: now,
      })
    );
  }

  if (opts?.visionTimeoutUnmitigated) {
    findings.push(
      finding({
        id: "vision_timeout_unmitigated",
        category: "vision_timeout_unmitigated",
        title: "Visionタイムアウト未対策",
        detail:
          "AbortSignal / total budget / compact-early が無効、または timeout 率が閾値超過。",
        evidenceRefs: ["lib/vision/timeout.ts"],
        detectedAt: now,
      })
    );
  }

  if (opts?.productionNotVerified !== false) {
    findings.push(
      finding({
        id: "production_e2e_unverified",
        category: "other",
        title: "本番E2E未検証",
        detail:
          "本番環境での成果物生成・Vision・通知・Storage・ジョブの証拠スイートが未完了。一般公開不可。",
        evidenceRefs: ["lib/quality-assurance/run-evidence-suite.ts"],
        detectedAt: now,
      })
    );
  }

  return findings;
}

/** ランタイムイベントから Critical を導出 */
export function collectRuntimeCriticalFindings(signals: {
  dataLossEvents?: number;
  corruptArtifactEvents?: number;
  storageLeakEvents?: number;
  authLeakEvents?: number;
  stuckJobs?: number;
  notificationMissEvents?: number;
  visionTimeoutRate?: number | null;
  visionTimeoutSampleSize?: number;
}): CriticalFinding[] {
  const now = new Date().toISOString();
  const findings: CriticalFinding[] = [];

  if ((signals.dataLossEvents ?? 0) > 0) {
    findings.push(
      finding({
        id: "runtime_data_loss",
        category: "data_loss",
        title: "データ消失イベント検出",
        detail: `${signals.dataLossEvents} 件のデータ消失シグナル`,
        evidenceRefs: ["atlas_reliability_events"],
        detectedAt: now,
      })
    );
  }
  if ((signals.corruptArtifactEvents ?? 0) > 0) {
    findings.push(
      finding({
        id: "runtime_corrupt_artifact",
        category: "corrupt_artifact",
        title: "成果物破損イベント検出",
        detail: `${signals.corruptArtifactEvents} 件の破損シグナル`,
        evidenceRefs: ["atlas_reliability_events", "word_metrics"],
        detectedAt: now,
      })
    );
  }
  if ((signals.storageLeakEvents ?? 0) > 0) {
    findings.push(
      finding({
        id: "runtime_storage_leak",
        category: "storage_leak",
        title: "Storage漏れイベント検出",
        detail: `${signals.storageLeakEvents} 件`,
        evidenceRefs: ["atlas_reliability_events"],
        detectedAt: now,
      })
    );
  }
  if ((signals.authLeakEvents ?? 0) > 0) {
    findings.push(
      finding({
        id: "runtime_auth_leak",
        category: "auth_leak",
        title: "認証漏れイベント検出",
        detail: `${signals.authLeakEvents} 件`,
        evidenceRefs: ["atlas_reliability_events"],
        detectedAt: now,
      })
    );
  }
  if ((signals.stuckJobs ?? 0) > 0) {
    findings.push(
      finding({
        id: "runtime_stuck_jobs",
        category: "stuck_job",
        title: "ジョブ停止検出",
        detail: `running/queued で heartbeat 切れ等: ${signals.stuckJobs} 件`,
        evidenceRefs: ["lib/jobs/job-store.ts"],
        detectedAt: now,
      })
    );
  }
  if ((signals.notificationMissEvents ?? 0) > 0) {
    findings.push(
      finding({
        id: "runtime_notification_miss",
        category: "notification_miss",
        title: "通知漏れ検出",
        detail: `${signals.notificationMissEvents} 件`,
        evidenceRefs: ["atlas_reliability_events"],
        detectedAt: now,
      })
    );
  }

  if (
    signals.visionTimeoutRate != null &&
    (signals.visionTimeoutSampleSize ?? 0) >= 5 &&
    signals.visionTimeoutRate > 0.05
  ) {
    findings.push(
      finding({
        id: "runtime_vision_timeout_high",
        category: "vision_timeout_unmitigated",
        title: "Visionタイムアウト率が高い（未対策疑い）",
        detail: `timeout率 ${(signals.visionTimeoutRate * 100).toFixed(2)}% (n=${signals.visionTimeoutSampleSize})`,
        evidenceRefs: ["atlas_reliability_events:timeout"],
        detectedAt: now,
      })
    );
  }

  return findings;
}
