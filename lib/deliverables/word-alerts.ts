/**
 * Configurable Word pipeline alerts for owner dashboards.
 * Missing notification targets must never crash the app.
 */

import { getWordMetricsSnapshot } from "./word-metrics";
import { listWordAnalytics } from "./word-analytics";
import { probeDeliverableStorage } from "./object-storage";

export type WordAlertThresholds = {
  minSuccessRate: number;
  maxConsecutiveStorageFailures: number;
  maxConsecutiveDownloadFailures: number;
  maxP95GenerateMs: number;
  maxAiContentFailureSpike: number;
  maxDuplicateGeneration: number;
  maxStaleJobs: number;
};

const DEFAULT_THRESHOLDS: WordAlertThresholds = {
  minSuccessRate: 0.9,
  maxConsecutiveStorageFailures: 3,
  maxConsecutiveDownloadFailures: 5,
  maxP95GenerateMs: 60_000,
  maxAiContentFailureSpike: 10,
  maxDuplicateGeneration: 5,
  maxStaleJobs: 5,
};

export type WordAlert = {
  id: string;
  severity: "critical" | "warn";
  title: string;
  message: string;
  metric: string;
  value: number | string | null;
  threshold: number | string | null;
};

function readThresholds(): WordAlertThresholds {
  const raw = process.env.ATLAS_WORD_ALERT_THRESHOLDS?.trim();
  if (!raw) return DEFAULT_THRESHOLDS;
  try {
    const parsed = JSON.parse(raw) as Partial<WordAlertThresholds>;
    return { ...DEFAULT_THRESHOLDS, ...parsed };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

export async function evaluateWordAlerts(input?: {
  generateSamplesMs?: number[];
  consecutiveStorageFailures?: number;
  consecutiveDownloadFailures?: number;
  staleJobCount?: number;
}): Promise<WordAlert[]> {
  const thresholds = readThresholds();
  const metrics = getWordMetricsSnapshot();
  const analytics = listWordAnalytics(1000 * 60 * 60);
  const alerts: WordAlert[] = [];

  if (
    metrics.successRate != null &&
    metrics.successRate < thresholds.minSuccessRate &&
    metrics.successes + metrics.failures >= 5
  ) {
    alerts.push({
      id: "success_rate_low",
      severity: "critical",
      title: "Word成功率が低下しています",
      message: "直近のWord生成成功率が閾値を下回っています。",
      metric: "successRate",
      value: metrics.successRate,
      threshold: thresholds.minSuccessRate,
    });
  }

  const storageFails =
    input?.consecutiveStorageFailures ?? metrics.storageFailures;
  if (storageFails >= thresholds.maxConsecutiveStorageFailures) {
    alerts.push({
      id: "storage_failures",
      severity: "critical",
      title: "保存失敗が連続しています",
      message: "Storage / 永続保存の失敗が閾値を超えています。",
      metric: "storageFailures",
      value: storageFails,
      threshold: thresholds.maxConsecutiveStorageFailures,
    });
  }

  const downloadFails =
    input?.consecutiveDownloadFailures ?? metrics.downloadFailures;
  if (downloadFails >= thresholds.maxConsecutiveDownloadFailures) {
    alerts.push({
      id: "download_failures",
      severity: "critical",
      title: "ダウンロード失敗が連続しています",
      message: "成果物ダウンロード失敗が閾値を超えています。",
      metric: "downloadFailures",
      value: downloadFails,
      threshold: thresholds.maxConsecutiveDownloadFailures,
    });
  }

  try {
    const storage = await probeDeliverableStorage();
    if (storage.severity === "critical") {
      alerts.push({
        id: "storage_connection",
        severity: "critical",
        title: "Storage接続に問題があります",
        message: storage.warning ?? "Supabase Storage が利用できません。",
        metric: "storage.ready",
        value: String(storage.ready),
        threshold: "true",
      });
    }
  } catch {
    alerts.push({
      id: "storage_probe_error",
      severity: "warn",
      title: "Storage診断に失敗しました",
      message: "診断自体は失敗しましたが、アプリは継続します。",
      metric: "storage.probe",
      value: "error",
      threshold: null,
    });
  }

  if (metrics.aiContentFailures >= thresholds.maxAiContentFailureSpike) {
    alerts.push({
      id: "ai_content_spike",
      severity: "warn",
      title: "AI本文生成失敗が急増しています",
      message: "文書内容の品質ゲート失敗が閾値を超えています。",
      metric: "aiContentFailures",
      value: metrics.aiContentFailures,
      threshold: thresholds.maxAiContentFailureSpike,
    });
  }

  const p95 = percentile(input?.generateSamplesMs ?? [], 95);
  if (p95 != null && p95 > thresholds.maxP95GenerateMs) {
    alerts.push({
      id: "p95_generate_slow",
      severity: "warn",
      title: "生成時間のp95が閾値を超過",
      message: "Word生成が遅くなっています。",
      metric: "p95GenerateMs",
      value: p95,
      threshold: thresholds.maxP95GenerateMs,
    });
  }

  if (metrics.dedupeHits >= thresholds.maxDuplicateGeneration) {
    alerts.push({
      id: "duplicate_generation",
      severity: "warn",
      title: "重複生成を検知しました",
      message: "同一ジョブの重複防止が頻発しています。",
      metric: "dedupeHits",
      value: metrics.dedupeHits,
      threshold: thresholds.maxDuplicateGeneration,
    });
  }

  const staleJobs = input?.staleJobCount ?? 0;
  if (staleJobs >= thresholds.maxStaleJobs) {
    alerts.push({
      id: "stale_jobs",
      severity: "critical",
      title: "ジョブが滞留しています",
      message: "再開不能または長時間停止のジョブがあります。",
      metric: "staleJobs",
      value: staleJobs,
      threshold: thresholds.maxStaleJobs,
    });
  }

  const integrityFails = analytics.filter(
    (e) => e.name === "recover" || e.stage === "integrity",
  ).length;
  if (integrityFails >= 3) {
    alerts.push({
      id: "corrupt_deliverable",
      severity: "critical",
      title: "成果物破損を検出",
      message: "整合性チェック失敗からの復旧が複数回発生しています。",
      metric: "integrityRecoveries",
      value: integrityFails,
      threshold: 3,
    });
  }

  return alerts;
}
