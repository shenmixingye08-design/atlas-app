import "server-only";

import { createNotification } from "./service";

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
    title: "自動化が終了しました",
    message: `お待たせいたしました。「${input.name}」の自動化が終了しました。`,
    relatedTaskId: input.automationId,
    relatedService: input.templateId === "sns_post" ? "x" : "atlas",
    actionUrl: automationActionUrl(input.automationId),
    automationId: input.automationId,
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
    lineEvent: "confirmation_request",
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
    actionUrl: automationActionUrl(input.automationId),
    automationId: input.automationId,
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
      ? `お待たせいたしました。投稿の準備が完了しました。`
      : "お待たせいたしました。投稿が完了しました。",
    relatedTaskId: historyId,
    relatedService: "x",
    actionUrl: historyId
      ? `/workspace/x?historyId=${encodeURIComponent(historyId)}`
      : "/workspace/x",
    requestId: historyId,
  });
}

export function notifyXPostFailed(userId: string, message: string) {
  const detail =
    message.trim() ||
    "Xへの投稿に失敗しました。内容をご確認のうえ、設定画面からX連携をご確認ください。";
  return createNotification({
    audience: "user",
    userId,
    type: "error",
    title: "Xへの投稿に失敗しました",
    message: detail,
    relatedService: "x",
    actionUrl: "/settings/x",
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
    title: "資料が完成しました",
    message: fileName
      ? `お待たせいたしました。「${fileName}」の保存が完了しました。`
      : "お待たせいたしました。資料の保存が完了しました。",
    relatedService: "google",
    actionUrl: "/workspace/drive",
    lineEvent: "document_ready",
  });
}

export function notifyGmailSummaryComplete(userId: string) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: "メールの要約が完了しました",
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
  },
) {
  if (!userId) return null;
  const deliverableId = input.deliverableId ?? input.relatedTaskId ?? null;
  // Fallback deep link only for rows with no deliverable id (rare). When a
  // deliverable id exists, `createNotification` canonicalizes the link to
  // `/results/<notificationId>` so「結果を見る」self-resolves the exact 成果物.
  const actionUrl =
    input.actionUrl ??
    (deliverableId ? deliverableActionUrl(deliverableId) : "/workspace");
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    // Keep the caller's task-type title (e.g.「レポートを作成しました」). The display
    // layer upgrades generic / internal-sounding titles automatically.
    title: input.title?.trim() || "お仕事が完了しました",
    message: input.message
      ? `お待たせいたしました。${input.message}`
      : "お待たせいたしました。ご依頼の内容が完了しました。",
    relatedTaskId: input.relatedTaskId ?? deliverableId,
    actionUrl,
    targetType: deliverableId ? "deliverable" : null,
    targetId: deliverableId,
    deliverableId,
    workflowRunId: input.workflowRunId ?? null,
    requestId: input.requestId ?? null,
    lineEvent: "work_completed",
  });
}

export function notifyWorkFailed(
  userId: string | null | undefined,
  input: {
    title: string;
    message: string;
    actionUrl?: string | null;
    relatedTaskId?: string | null;
    deliverableId?: string | null;
    workflowRunId?: string | null;
    requestId?: string | null;
  },
) {
  if (!userId) return null;
  const deliverableId = input.deliverableId ?? input.relatedTaskId ?? null;
  // A failed run still resolves to its own result page so「確認する」shows
  // 成果物の生成に失敗しました + reason instead of a dead list. When a deliverable id
  // exists the link is canonicalized to `/results/<notificationId>`.
  const actionUrl =
    input.actionUrl ??
    (deliverableId ? deliverableActionUrl(deliverableId) : "/workspace");
  return createNotification({
    audience: "user",
    userId,
    // Store the caller title + reason so the display layer can derive a
    // task-type failed title (e.g.「契約書の処理を完了できませんでした」). The visible
    // message stays sanitized/generic; the full reason shows on the result page
    // (成果物の生成に失敗しました + reason).
    type: "error",
    title: input.title?.trim() || "処理を完了できませんでした",
    message: input.message?.trim()
      ? `処理を完了できませんでした。${input.message.trim()}`
      : "処理を完了できませんでした。内容をご確認ください。",
    relatedTaskId: input.relatedTaskId ?? deliverableId,
    actionUrl,
    targetType: deliverableId ? "deliverable" : null,
    targetId: deliverableId,
    deliverableId,
    workflowRunId: input.workflowRunId ?? null,
    requestId: input.requestId ?? null,
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
    title: "資料が完成しました",
    message: `お待たせいたしました。「${input.fileName}」の準備が完了しました。`,
    relatedService: "atlas",
    actionUrl: input.href ?? "/workspace/drive",
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
