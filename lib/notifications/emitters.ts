import "server-only";

import { createNotification } from "./service";

export function notifyAutomationCompleted(
  userId: string | null | undefined,
  input: { automationId: string; name: string; templateId?: string },
) {
  if (!userId) return null;
  const isSns = input.templateId === "sns_post";
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: isSns ? "SNS投稿が完了しました" : `${input.name}が完了しました`,
    message: isSns
      ? "自動化によるSNS投稿が正常に完了しました。"
      : `「${input.name}」の自動化が完了しました。`,
    relatedTaskId: input.automationId,
    relatedService: isSns ? "x" : "atlas",
    actionUrl: "/automations",
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
    title: "確認待ちの仕事があります",
    message: `「${input.name}」の確認が必要です。`,
    relatedTaskId: input.automationId,
    relatedService: "atlas",
    actionUrl: "/automations",
  });
}

export function notifyAutomationFailed(
  userId: string | null | undefined,
  input: { automationId: string; name: string; error?: string },
) {
  if (!userId) return null;
  return createNotification({
    audience: "user",
    userId,
    type: "automation",
    title: `${input.name}に失敗しました`,
    message: input.error ?? "自動化の実行中にエラーが発生しました。",
    relatedTaskId: input.automationId,
    relatedService: "atlas",
    actionUrl: "/automations",
  });
}

export function notifyXPostSuccess(userId: string, text?: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "X投稿が完了しました",
    message: text
      ? `投稿内容: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`
      : "Xへの投稿が正常に完了しました。",
    relatedService: "x",
    actionUrl: "/workspace/x",
  });
}

export function notifyXPostFailed(userId: string, message: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "error",
    title: "X投稿に失敗しました",
    message,
    relatedService: "x",
    actionUrl: "/settings/x",
  });
}

export function notifyDriveSaveComplete(userId: string, fileName?: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "Google Drive保存が完了しました",
    message: fileName
      ? `「${fileName}」をGoogle Driveに保存しました。`
      : "成果物をGoogle Driveに保存しました。",
    relatedService: "google",
    actionUrl: "/workspace/drive",
  });
}

export function notifyGmailSummaryComplete(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "Gmail要約が完了しました",
    message: "メールの要約と返信下書きの準備ができました。",
    relatedService: "google",
    actionUrl: "/workspace/mail",
  });
}

export function notifyCalendarReminder(userId: string, title: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "automation",
    title: "カレンダー予定の通知",
    message: title,
    relatedService: "google",
    actionUrl: "/workspace/calendar",
  });
}

export function notifyBillingPaymentFailed(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "お支払いに失敗しました",
    message:
      "お支払いの処理に失敗しました。7日以内に更新されない場合、自動化機能が停止します。",
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyBillingPaymentSucceeded(userId: string, planLabel?: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "お支払いが完了しました",
    message: planLabel
      ? `${planLabel}プランのお支払いが確認されました。`
      : "お支払いが正常に処理されました。",
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyBillingPlanChanged(userId: string, planLabel: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "プランが更新されました",
    message: `${planLabel}プランに変更されました。`,
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyBillingPlanDowngraded(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "Freeプランに変更されました",
    message:
      "サブスクリプションが終了したため、Freeプランに変更されました。",
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyBillingGraceScheduled(userId: string, graceEndsAt: string) {
  const formatted = new Date(graceEndsAt).toLocaleString("ja-JP");
  return createNotification({
    audience: "user",
    userId,
    type: "billing",
    title: "自動停止予定",
    message: `お支払いが確認できない場合、${formatted} 以降に自動化機能が停止されます。`,
    relatedService: "stripe",
    actionUrl: "/settings/billing",
  });
}

export function notifyIntegrationError(
  userId: string,
  input: { service: string; message: string },
) {
  return createNotification({
    audience: "user",
    userId,
    type: "integration",
    title: `${input.service}連携エラー`,
    message: input.message,
    relatedService: input.service.toLowerCase(),
    actionUrl: "/settings",
  });
}

export function notifyIntegrationExpiring(userId: string, service: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "integration",
    title: `${service}認証の期限が近づいています`,
    message: "連携を維持するため、再認証をお願いします。",
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
    title: input.title,
    message: input.message,
    actionUrl: input.actionUrl ?? "/projects",
  });
}

export function notifyWorkCompleted(
  userId: string | null | undefined,
  input: { title: string; message: string },
) {
  if (!userId) return null;
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: input.title,
    message: input.message,
    actionUrl: "/workspace",
  });
}

export function notifyWorkFailed(
  userId: string | null | undefined,
  input: { title: string; message: string },
) {
  if (!userId) return null;
  return createNotification({
    audience: "user",
    userId,
    type: "error",
    title: input.title,
    message: input.message,
    actionUrl: "/workspace",
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
