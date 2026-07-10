import "server-only";

import { createNotification } from "./service";

export function notifyAutomationCompleted(
  userId: string | null | undefined,
  input: { automationId: string; name: string; templateId?: string },
) {
  if (!userId) return null;
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "お仕事が完了しました",
    message: `お待たせいたしました。「${input.name}」の作成が完了しました。`,
    relatedTaskId: input.automationId,
    relatedService: input.templateId === "sns_post" ? "x" : "atlas",
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
    title: "ご確認が必要な仕事がございます",
    message: `「${input.name}」について、ご確認をお願いいたします。`,
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
    title: "処理を完了できませんでした",
    message: `「${input.name}」の処理を完了できませんでした。内容をご確認ください。`,
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
    title: "お仕事が完了しました",
    message: text
      ? `お待たせいたしました。投稿の準備が完了しました。`
      : "お待たせいたしました。投稿が完了しました。",
    relatedService: "x",
    actionUrl: "/workspace/x",
  });
}

export function notifyXPostFailed(userId: string, _message: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "error",
    title: "処理を完了できませんでした",
    message: "処理を完了できませんでした。内容をご確認ください。",
    relatedService: "x",
    actionUrl: "/settings/x",
  });
}

export function notifyDriveSaveComplete(userId: string, fileName?: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "お仕事が完了しました",
    message: fileName
      ? `お待たせいたしました。「${fileName}」の保存が完了しました。`
      : "お待たせいたしました。資料の保存が完了しました。",
    relatedService: "google",
    actionUrl: "/workspace/drive",
  });
}

export function notifyGmailSummaryComplete(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "お仕事が完了しました",
    message: "お待たせいたしました。メールの要約と返信案の準備が完了しました。",
    relatedService: "google",
    actionUrl: "/workspace/mail",
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

export function notifyBillingPaymentSucceeded(userId: string, planLabel?: string) {
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

export function notifyBillingGraceScheduled(userId: string, graceEndsAt: string) {
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
  return createNotification({
    audience: "user",
    userId,
    type: "integration",
    title: "処理を完了できませんでした",
    message: "処理を完了できませんでした。連携設定をご確認ください。",
    relatedService: input.service.toLowerCase(),
    actionUrl: "/settings",
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
  input: { title: string; message: string },
) {
  if (!userId) return null;
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "お仕事が完了しました",
    message: input.message
      ? `お待たせいたしました。${input.message}`
      : "お待たせいたしました。ご依頼の内容が完了しました。",
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
    title: "処理を完了できませんでした",
    message: "処理を完了できませんでした。内容をご確認ください。",
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
