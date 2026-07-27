import "server-only";

import {
  classifyFailure,
  type FailureClass,
} from "@/lib/reliability/error-classification";

import {
  buildCompletedMessage,
  buildCompletedProgress,
  buildFailureMessage,
  buildFailureProgress,
  buildFailureTitle,
} from "./job-progress";
import { createNotification } from "./service";
import type { NotificationJobProgress } from "./types";

/** Deep link that opens the exact automation in its detail panel. */
function automationActionUrl(automationId: string): string {
  return `/automations?id=${encodeURIComponent(automationId)}`;
}

/** Deep link that opens the exact 成果物 (durable project detail) by id. */
function deliverableActionUrl(deliverableId: string): string {
  return `/projects/${encodeURIComponent(deliverableId)}`;
}

export function notifyAutomationCompleted(
  userId: string | null | undefined,
  input: { automationId: string; name: string; templateId?: string },
) {
  if (!userId) return null;
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: `「${input.name}」が完了しました`,
    message: `お待たせいたしました。「${input.name}」の自動化が終了しました。プレビュー・再実行がご利用いただけます。`,
    relatedTaskId: input.automationId,
    relatedService: input.templateId === "sns_post" ? "x" : "atlas",
    actionUrl: automationActionUrl(input.automationId),
    automationId: input.automationId,
    jobName: input.name,
    jobProgress: buildCompletedProgress({
      jobName: input.name,
      step: "notify",
      reeditUrl: automationActionUrl(input.automationId),
    }),
    lineEvent: "automation_completed",
  });
}

export function notifyAutomationAwaitingReview(
  userId: string | null | undefined,
  input: { automationId: string; name: string },
) {
  if (!userId) return null;
  return createNotification({
    audience: "user",
    userId,
    type: "awaiting_review",
    title: "ご確認が必要な仕事がございます",
    message: `「${input.name}」について、ご確認をお願いいたします。`,
    relatedTaskId: input.automationId,
    relatedService: "atlas",
    actionUrl: automationActionUrl(input.automationId),
    automationId: input.automationId,
    jobName: input.name,
    lineEvent: "confirmation_request",
  });
}

export function notifyAutomationFailed(
  userId: string | null | undefined,
  input: {
    automationId: string;
    name: string;
    error?: string;
    step?: string | null;
    failureClass?: FailureClass;
    retryCount?: number;
    maxRetries?: number;
    retrying?: boolean;
    startedAt?: string | null;
    supportContextId?: string | null;
  },
) {
  if (!userId) return null;
  const failureClass =
    input.failureClass ?? classifyFailure(input.error ?? "automation_failed");
  const retryCount = input.retryCount ?? 0;
  const maxRetries = input.maxRetries ?? 3;
  const retrying = Boolean(input.retrying);
  const progress = buildFailureProgress({
    jobName: input.name,
    step: input.step ?? "execute",
    failureClass,
    failureReason: input.error ?? null,
    retryCount,
    maxRetries,
    retrying,
    startedAt: input.startedAt ?? null,
    supportContextId: input.supportContextId ?? null,
    retryActionUrl: automationActionUrl(input.automationId),
  });
  return createNotification({
    audience: "user",
    userId,
    type: "automation",
    title: buildFailureTitle({
      jobName: input.name,
      step: input.step ?? "execute",
    }),
    message: buildFailureMessage({
      jobName: input.name,
      step: input.step ?? "execute",
      failureClass,
      failureReason: input.error ?? null,
      retryCount,
      maxRetries,
      retrying,
    }),
    relatedTaskId: input.automationId,
    relatedService: "atlas",
    actionUrl: automationActionUrl(input.automationId),
    automationId: input.automationId,
    jobName: input.name,
    jobProgress: progress,
    lineEvent: "error",
  });
}

export function notifyXPostSuccess(
  userId: string,
  text?: string,
  options?: { historyId?: string | null },
) {
  const historyId = options?.historyId ?? null;
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "X自動投稿が完了しました",
    message: text
      ? "お待たせいたしました。投稿の準備が完了しました。プレビュー・共有・再編集がご利用いただけます。"
      : "お待たせいたしました。投稿が完了しました。プレビュー・共有・再編集がご利用いただけます。",
    relatedTaskId: historyId,
    relatedService: "x",
    actionUrl: historyId
      ? `/workspace/x?historyId=${encodeURIComponent(historyId)}`
      : "/workspace/x",
    requestId: historyId,
    jobName: "X自動投稿",
    jobProgress: buildCompletedProgress({
      jobName: "X自動投稿",
      copyText: text ?? null,
      reeditUrl: "/workspace/x",
      shareUrl: historyId
        ? `/workspace/x?historyId=${encodeURIComponent(historyId)}`
        : "/workspace/x",
    }),
  });
}

export function notifyXPostFailed(userId: string, message: string) {
  const failureClass = classifyFailure(message);
  const detail =
    message.trim() ||
    "Xへの投稿に失敗しました。内容をご確認のうえ、設定画面からX連携をご確認ください。";
  return createNotification({
    audience: "user",
    userId,
    type: "error",
    title: buildFailureTitle({ jobName: "X投稿", step: "execute" }),
    message: buildFailureMessage({
      jobName: "X投稿",
      step: "execute",
      failureClass,
      failureReason: detail,
      retryCount: 0,
      maxRetries: 3,
      retrying: false,
      nextAction: "設定画面からX連携をご確認のうえ、再実行してください。",
    }),
    relatedService: "x",
    actionUrl: "/settings/x",
    jobName: "X投稿",
    jobProgress: buildFailureProgress({
      jobName: "X投稿",
      step: "execute",
      failureClass,
      failureReason: detail,
      retryCount: 0,
      maxRetries: 3,
      retrying: false,
      retryActionUrl: "/workspace/x",
    }),
    lineEvent: "error",
  });
}

/** Recurring X post success — deep-links to the automation execution history. */
export function notifyXRecurringPostSuccess(
  userId: string | null | undefined,
  input: { automationId: string; executionId: string },
) {
  if (!userId) return null;
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "Xへの定期投稿が完了しました",
    message:
      "お待たせいたしました。Xへの定期投稿が完了しました。プレビュー・共有・再編集がご利用いただけます。",
    relatedTaskId: input.executionId,
    relatedService: "x",
    actionUrl: `/automations?id=${encodeURIComponent(input.automationId)}&executionId=${encodeURIComponent(input.executionId)}`,
    automationId: input.automationId,
    requestId: input.executionId,
    jobName: "X定期投稿",
    jobProgress: buildCompletedProgress({
      jobName: "X定期投稿",
      reeditUrl: `/automations?id=${encodeURIComponent(input.automationId)}`,
    }),
    lineEvent: "automation_completed",
  });
}

/** Recurring X post failure — deep-links to the automation execution history. */
export function notifyXRecurringPostFailed(
  userId: string | null | undefined,
  input: {
    automationId: string;
    executionId: string;
    errorMessage?: string;
  },
) {
  if (!userId) return null;
  const failureClass = classifyFailure(
    input.errorMessage ?? "x_recurring_failed",
  );
  const reason =
    input.errorMessage?.trim() ||
    "Xへの定期投稿に失敗しました。外部連携と実行履歴をご確認ください。";
  return createNotification({
    audience: "user",
    userId,
    type: "error",
    title: buildFailureTitle({ jobName: "X定期投稿", step: "execute" }),
    message: buildFailureMessage({
      jobName: "X定期投稿",
      step: "execute",
      failureClass,
      failureReason: reason,
      retryCount: 0,
      maxRetries: 3,
      retrying: false,
    }),
    relatedTaskId: input.executionId,
    relatedService: "x",
    actionUrl: `/automations?id=${encodeURIComponent(input.automationId)}&executionId=${encodeURIComponent(input.executionId)}`,
    automationId: input.automationId,
    requestId: input.executionId,
    jobName: "X定期投稿",
    jobProgress: buildFailureProgress({
      jobName: "X定期投稿",
      step: "execute",
      failureClass,
      failureReason: reason,
      retryCount: 0,
      maxRetries: 3,
      retrying: false,
      retryActionUrl: `/automations?id=${encodeURIComponent(input.automationId)}`,
    }),
    lineEvent: "error",
  });
}

export function notifyXAutoPostDrafted(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "awaiting_review",
    title: "ご確認が必要な投稿がございます",
    message:
      "自動投稿の下書きをご用意しました。内容をご確認のうえ、投稿をお願いいたします。",
    relatedService: "x",
    actionUrl: "/workspace/x",
    lineEvent: "confirmation_request",
  });
}

export function notifyDriveSaveComplete(userId: string, fileName?: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: fileName
      ? `「${fileName}」の保存が完了しました`
      : "資料の保存が完了しました",
    message: fileName
      ? `お待たせいたしました。「${fileName}」の保存が完了しました。プレビュー・ダウンロードがご利用いただけます。`
      : "お待たせいたしました。資料の保存が完了しました。プレビュー・ダウンロードがご利用いただけます。",
    relatedService: "google",
    actionUrl: "/workspace/drive",
    jobName: fileName ?? "資料保存",
    jobProgress: buildCompletedProgress({
      jobName: fileName ?? "資料保存",
      downloadUrl: "/workspace/drive",
    }),
    lineEvent: "document_ready",
  });
}

export function notifyGmailSummaryComplete(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "メールの要約が完了しました",
    message:
      "お待たせいたしました。メールの要約と返信案の準備が完了しました。プレビュー・コピー・再編集がご利用いただけます。",
    relatedService: "google",
    actionUrl: "/workspace/mail",
    jobName: "メール要約",
    jobProgress: buildCompletedProgress({
      jobName: "メール要約",
      reeditUrl: "/workspace/mail",
    }),
  });
}

export function notifyCalendarReminder(userId: string, title: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "automation",
    title: "次回の実行予定のご案内",
    message: `次回の実行予定をご案内します。${title}`,
    relatedService: "google",
    actionUrl: "/workspace/calendar",
    lineEvent: "todays_schedule",
  });
}

export function notifyBillingPaymentFailed(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "運営からのお知らせ",
    message:
      "お支払いの確認ができませんでした。お手数ですが、お支払い情報をご確認ください。",
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyBillingPaymentSucceeded(
  userId: string,
  planLabel?: string,
) {
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "運営からのお知らせ",
    message: planLabel
      ? `${planLabel}プランのお支払いを確認いたしました。`
      : "お支払いを確認いたしました。",
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyBillingPlanChanged(userId: string, planLabel: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "運営からのお知らせ",
    message: `${planLabel}プランへ変更いたしました。`,
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyBillingPlanDowngraded(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "運営からのお知らせ",
    message: "プランをFreeへ変更いたしました。",
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyBillingGraceScheduled(
  userId: string,
  graceEndsAt: string,
) {
  const formatted = new Date(graceEndsAt).toLocaleString("ja-JP");
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "運営からのお知らせ",
    message: `お支払いが確認できない場合、${formatted} 以降に一部機能が停止する可能性がございます。`,
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyIntegrationError(
  userId: string,
  input: { service: string; message: string },
) {
  const failureClass = classifyFailure(input.message || "integration_error");
  const serviceLabel = input.service || "外部連携";
  return createNotification({
    audience: "user",
    userId,
    type: "integration",
    title: buildFailureTitle({
      jobName: `${serviceLabel}連携`,
      step: "execute",
    }),
    message: buildFailureMessage({
      jobName: `${serviceLabel}連携`,
      step: "execute",
      failureClass,
      failureReason: input.message || "連携設定をご確認ください。",
      retryCount: 0,
      maxRetries: 3,
      retrying: false,
      nextAction: "設定画面から連携状態をご確認ください。",
    }),
    relatedService: input.service.toLowerCase(),
    actionUrl: "/settings",
    jobName: `${serviceLabel}連携`,
    jobProgress: buildFailureProgress({
      jobName: `${serviceLabel}連携`,
      step: "execute",
      failureClass,
      failureReason: input.message || "連携設定をご確認ください。",
      retryCount: 0,
      maxRetries: 3,
      retrying: false,
      retryActionUrl: "/settings",
    }),
    lineEvent: "error",
  });
}

export function notifyIntegrationExpiring(userId: string, service: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "integration",
    title: "ご確認が必要な仕事がございます",
    message: "連携を継続するため、再認証のご確認をお願いいたします。",
    relatedService: service.toLowerCase(),
    actionUrl: "/settings",
  });
}

export function notifyRecommendation(
  userId: string,
  input: { title: string; message: string; actionUrl?: string },
) {
  return createNotification({
    audience: "user",
    userId,
    type: "recommendation",
    title: "改善のご提案がございます",
    message: `改善できる可能性のある仕事が見つかりました。${input.message}`,
    actionUrl: input.actionUrl ?? "/settings/learning",
  });
}

export function notifyWorkCompleted(
  userId: string | null | undefined,
  input: {
    title: string;
    message: string;
    /** Deep link to the exact result (durable page, e.g. `/projects/<id>`). */
    actionUrl?: string | null;
    /** Related resource id used for deep-link targeting. */
    relatedTaskId?: string | null;
    /** Durable 成果物 id — the exact project the deep link opens. */
    deliverableId?: string | null;
    /** Workflow run id that produced this result. */
    workflowRunId?: string | null;
    /** Originating request/run id. */
    requestId?: string | null;
    jobName?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    previewText?: string | null;
    jobProgress?: NotificationJobProgress | null;
  },
) {
  if (!userId) return null;
  const deliverableId = input.deliverableId ?? input.relatedTaskId ?? null;
  const actionUrl =
    input.actionUrl ??
    (deliverableId ? deliverableActionUrl(deliverableId) : "/workspace");
  const jobName =
    input.jobName?.trim() ||
    input.title.match(/「([^」]+)」/)?.[1] ||
    "ご依頼の仕事";
  const progress =
    input.jobProgress ??
    buildCompletedProgress({
      jobName,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? new Date().toISOString(),
      previewText: input.previewText ?? null,
      downloadUrl: actionUrl,
      shareUrl: actionUrl,
      copyText: input.previewText ?? input.message ?? null,
      reeditUrl: "/",
    });
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: input.title?.trim() || `「${jobName}」が完了しました`,
    message: buildCompletedMessage({
      jobName,
      previewText: input.previewText ?? input.message ?? null,
      downloadUrl: actionUrl,
      shareUrl: actionUrl,
      copyText: input.previewText ?? null,
      reeditUrl: "/",
    }),
    relatedTaskId: input.relatedTaskId ?? deliverableId,
    actionUrl,
    targetType: deliverableId ? "deliverable" : null,
    targetId: deliverableId,
    deliverableId,
    workflowRunId: input.workflowRunId ?? null,
    requestId: input.requestId ?? null,
    jobName,
    jobProgress: progress,
    lineEvent: "work_completed",
  });
}

export function notifyWorkFailed(
  userId: string | null | undefined,
  input: {
    title?: string;
    message?: string;
    actionUrl?: string | null;
    relatedTaskId?: string | null;
    deliverableId?: string | null;
    workflowRunId?: string | null;
    requestId?: string | null;
    jobName?: string | null;
    step?: string | null;
    failureClass?: FailureClass;
    failureReason?: string | null;
    retryCount?: number;
    maxRetries?: number;
    retrying?: boolean;
    startedAt?: string | null;
    endedAt?: string | null;
    etaSeconds?: number | null;
    nextAction?: string | null;
    supportContextId?: string | null;
    retryActionUrl?: string | null;
    processLogSummary?: string | null;
    jobProgress?: NotificationJobProgress | null;
  },
) {
  if (!userId) return null;
  const deliverableId = input.deliverableId ?? input.relatedTaskId ?? null;
  const actionUrl =
    input.actionUrl ??
    (deliverableId ? deliverableActionUrl(deliverableId) : "/workspace");
  const jobName = input.jobName?.trim() || "ご依頼の仕事";
  const failureClass =
    input.failureClass ??
    classifyFailure(input.failureReason ?? input.message ?? "work_failed");
  const retryCount = input.retryCount ?? 0;
  const maxRetries = input.maxRetries ?? 3;
  const retrying = Boolean(input.retrying);
  const progress =
    input.jobProgress ??
    buildFailureProgress({
      jobName,
      step: input.step ?? "execute",
      failureClass,
      failureReason: input.failureReason ?? input.message ?? null,
      retryCount,
      maxRetries,
      retrying,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      etaSeconds: input.etaSeconds ?? null,
      nextAction: input.nextAction ?? null,
      supportContextId: input.supportContextId ?? null,
      retryActionUrl:
        input.retryActionUrl ??
        (input.requestId
          ? `/api/work/jobs/${encodeURIComponent(input.requestId)}/retry`
          : actionUrl),
      processLogSummary: input.processLogSummary ?? null,
    });

  return createNotification({
    audience: "user",
    userId,
    type: "error",
    title:
      input.title?.trim() ||
      buildFailureTitle({ jobName, step: input.step ?? "execute" }),
    message: buildFailureMessage({
      jobName,
      step: input.step ?? "execute",
      failureClass,
      failureReason: input.failureReason ?? input.message ?? null,
      retryCount,
      maxRetries,
      retrying,
      nextAction: input.nextAction ?? null,
    }),
    relatedTaskId: input.relatedTaskId ?? deliverableId,
    actionUrl,
    targetType: deliverableId ? "deliverable" : null,
    targetId: deliverableId,
    deliverableId,
    workflowRunId: input.workflowRunId ?? null,
    requestId: input.requestId ?? null,
    jobName,
    jobProgress: progress,
    lineEvent: "error",
  });
}

export function notifyMailReceived(
  userId: string,
  input: { subject: string; sender?: string; count?: number },
) {
  const count = input.count ?? 1;
  return createNotification({
    audience: "user",
    userId,
    type: "automation",
    title: "メールを受信しました",
    message:
      count > 1
        ? `新着メールが${count}件あります。件名例: ${input.subject}`
        : input.sender
          ? `${input.sender} から「${input.subject}」を受信しました。`
          : `「${input.subject}」を受信しました。`,
    relatedService: "google",
    actionUrl: "/workspace/mail",
    lineEvent: "mail_received",
  });
}

export function notifyDocumentReady(
  userId: string,
  input: { fileName: string; href?: string },
) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: `「${input.fileName}」の準備が完了しました`,
    message: `お待たせいたしました。「${input.fileName}」の準備が完了しました。プレビュー・ダウンロード・共有がご利用いただけます。`,
    relatedService: "atlas",
    actionUrl: input.href ?? "/workspace/drive",
    jobName: input.fileName,
    jobProgress: buildCompletedProgress({
      jobName: input.fileName,
      downloadUrl: input.href ?? "/workspace/drive",
      shareUrl: input.href ?? "/workspace/drive",
    }),
    lineEvent: "document_ready",
  });
}

export function notifyTodaysSchedule(
  userId: string,
  input: { summary: string; eventCount: number },
) {
  return createNotification({
    audience: "user",
    userId,
    type: "automation",
    title: "今日の予定",
    message:
      input.eventCount === 0
        ? "本日の予定はありません。"
        : `本日の予定は${input.eventCount}件です。${input.summary}`,
    relatedService: "google",
    actionUrl: "/workspace/calendar",
    lineEvent: "todays_schedule",
  });
}

export function notifyMorningBriefing(
  userId: string,
  input: { summary: string },
) {
  return createNotification({
    audience: "user",
    userId,
    type: "automation",
    title: "朝のブリーフィング",
    message: input.summary,
    relatedService: "atlas",
    actionUrl: "/",
    lineEvent: "morning_briefing",
  });
}

/** Owner-only notifications */
export function notifyOwnerStripeWebhookFailed(message: string) {
  return createNotification({
    audience: "owner",
    userId: null,
    type: "error",
    title: "Stripe Webhook失敗",
    message,
    relatedService: "stripe",
    actionUrl: "/owner/billing-webhook",
  });
}

export function notifyOwnerApiBudgetExceeded(message: string) {
  return createNotification({
    audience: "owner",
    userId: null,
    type: "error",
    title: "API予算超過",
    message,
    relatedService: "openai",
    actionUrl: "/owner/api-usage",
  });
}

export function notifyOwnerHighCostWarning(message: string) {
  return createNotification({
    audience: "owner",
    userId: null,
    type: "error",
    title: "高コスト警告",
    message,
    relatedService: "atlas",
    actionUrl: "/owner/cost-ranking",
  });
}

export function notifyOwnerSystemIncident(message: string) {
  return createNotification({
    audience: "owner",
    userId: null,
    type: "error",
    title: "システム障害",
    message,
    relatedService: "atlas",
    actionUrl: "/owner/system-status",
  });
}

export function notifyOwnerExternalApiError(service: string, message: string) {
  return createNotification({
    audience: "owner",
    userId: null,
    type: "error",
    title: `${service} APIエラー`,
    message,
    relatedService: service.toLowerCase(),
    actionUrl: "/owner/error-monitoring",
  });
}

export function notifyOwnerPaymentFailed(userId: string) {
  return createNotification({
    audience: "owner",
    userId: null,
    type: "billing",
    title: "Stripe決済失敗",
    message: `ユーザー ${userId} の決済が失敗しました。`,
    relatedService: "stripe",
    actionUrl: "/owner/billing-webhook",
  });
}
