/**
 * Job progress metadata helpers for detailed secretary notifications.
 * Ban generic「処理を完了できませんでした」— always show job / step / cause / state / next.
 */

import {
  failureClassCause,
  failureClassLabel,
  type FailureClass,
} from "@/lib/reliability/error-classification";

import type { JobProgressState, NotificationJobProgress } from "./types";

export type BuildFailureNoticeInput = {
  jobName: string;
  step?: string | null;
  failureClass: FailureClass;
  failureReason?: string | null;
  retryCount: number;
  maxRetries: number;
  retrying?: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  etaSeconds?: number | null;
  nextAction?: string | null;
  processLogSummary?: string | null;
  supportContextId?: string | null;
  retryActionUrl?: string | null;
};

export type BuildCompletedNoticeInput = {
  jobName: string;
  step?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  previewText?: string | null;
  downloadUrl?: string | null;
  shareUrl?: string | null;
  copyText?: string | null;
  reeditUrl?: string | null;
};

const JOB_STATE_LABELS: Record<JobProgressState, string> = {
  queued: "受付済み",
  running: "処理中",
  retrying: "再試行中",
  confirming: "確認中",
  saving: "保存中",
  notifying: "通知準備中",
  completed: "完了",
  partial: "一部完了（要確認）",
  failed: "失敗",
  cancelled: "中止",
};

export function jobStateLabel(state: JobProgressState): string {
  return JOB_STATE_LABELS[state];
}

export function formatStepLabel(step: string | null | undefined): string {
  if (!step?.trim()) return "処理";
  const normalized = step.trim();
  const map: Record<string, string> = {
    execute: "実行",
    confirm: "確認",
    save: "保存",
    notify: "通知",
    word: "Word生成",
    pdf: "PDF生成",
    excel: "Excel生成",
    generation: "成果物生成",
    openai: "AI応答",
    orchestration: "仕事の実行",
  };
  const key = normalized.toLowerCase();
  return map[key] ?? normalized;
}

/** Title for a step failure — never the banned generic phrase. */
export function buildFailureTitle(input: {
  jobName?: string | null;
  step?: string | null;
}): string {
  const step = formatStepLabel(input.step);
  if (input.jobName?.trim()) {
    return `「${input.jobName.trim()}」の${step}中にエラーが発生しました`;
  }
  return `${step}中にエラーが発生しました`;
}

/**
 * Multi-line secretary message with job / step / cause / state / next action.
 * Example:
 *   Word生成中にエラーが発生しました。
 *   現在AIが自動で再試行しています。
 *   再試行回数 1 / 3
 *   推定原因 ・AI応答タイムアウト
 *   現在の状況 処理継続中
 */
export function buildFailureMessage(input: BuildFailureNoticeInput): string {
  const step = formatStepLabel(input.step);
  const cause =
    input.failureReason?.trim() || failureClassCause(input.failureClass);
  const classLabel = failureClassLabel(input.failureClass);
  const retrying = Boolean(input.retrying);
  const state: JobProgressState = retrying ? "retrying" : "failed";
  const next =
    input.nextAction?.trim() ||
    (retrying
      ? "自動で再試行を続けます。完了までお待ちください。"
      : "再実行するか、サポートへ状況をお送りください。");

  const lines = [
    `${step}中にエラーが発生しました。`,
    retrying
      ? "現在AIが自動で再試行しています。"
      : "自動再試行の上限に達しました。",
    `再試行回数 ${Math.max(0, input.retryCount)} / ${Math.max(1, input.maxRetries)}`,
    `推定原因 ・${cause}（${classLabel}）`,
    `現在の状況 ${jobStateLabel(state)}`,
    `次の対応 ・${next}`,
  ];

  return lines.join("\n");
}

export function buildFailureProgress(
  input: BuildFailureNoticeInput,
): NotificationJobProgress {
  const retrying = Boolean(input.retrying);
  return {
    jobName: input.jobName,
    jobState: retrying ? "retrying" : "failed",
    currentStep: input.step ?? "execute",
    failureClass: input.failureClass,
    failureReason:
      input.failureReason?.trim() || failureClassCause(input.failureClass),
    nextAction:
      input.nextAction?.trim() ||
      (retrying
        ? "自動再試行を継続しています"
        : "再実行またはサポートへの送信"),
    retryCount: input.retryCount,
    maxRetries: input.maxRetries,
    retrying,
    etaSeconds: input.etaSeconds ?? (retrying ? 90 : null),
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? (retrying ? null : new Date().toISOString()),
    supportContextId: input.supportContextId ?? null,
    retryActionUrl: input.retryActionUrl ?? null,
    processLogSummary: input.processLogSummary ?? null,
    resultActions: null,
  };
}

export function buildCompletedMessage(input: BuildCompletedNoticeInput): string {
  const name = input.jobName.trim();
  const preview = input.previewText?.trim();
  const lines = [
    name
      ? `お待たせいたしました。「${name}」の準備が完了しました。`
      : "お待たせいたしました。ご依頼の内容が完了しました。",
  ];
  if (preview) {
    lines.push(`プレビュー: ${preview.slice(0, 120)}${preview.length > 120 ? "…" : ""}`);
  }
  lines.push("プレビュー・ダウンロード・共有・コピー・再編集がご利用いただけます。");
  return lines.join("\n");
}

export function buildCompletedProgress(
  input: BuildCompletedNoticeInput,
): NotificationJobProgress {
  return {
    jobName: input.jobName,
    jobState: "completed",
    currentStep: input.step ?? "notify",
    failureClass: null,
    failureReason: null,
    nextAction: "成果物をご確認ください",
    retryCount: null,
    maxRetries: null,
    retrying: false,
    etaSeconds: null,
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? new Date().toISOString(),
    supportContextId: null,
    retryActionUrl: null,
    processLogSummary: null,
    resultActions: {
      previewUrl: null,
      downloadUrl: input.downloadUrl ?? null,
      shareUrl: input.shareUrl ?? null,
      copyText: input.copyText ?? null,
      reeditUrl: input.reeditUrl ?? null,
    },
  };
}

/** Estimate remaining seconds from retry attempt index. */
export function estimateRetryEtaSeconds(retryCount: number): number {
  const schedule = [30, 60, 90, 120];
  return schedule[Math.min(Math.max(retryCount, 0), schedule.length - 1)] ?? 90;
}
