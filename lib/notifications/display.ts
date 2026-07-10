import type { NotificationRecord, NotificationType } from "./types";

/** User-facing notice categories for the secretary inbox. */
export type NoticeCategory =
  | "needs_review"
  | "completed"
  | "scheduled"
  | "improvement"
  | "needs_material"
  | "error"
  | "ops"
  | "general";

export type NoticePriority = "normal" | "important" | "urgent";

export const NOTICE_CATEGORY_LABELS: Record<NoticeCategory, string> = {
  needs_review: "確認が必要",
  completed: "仕事が完了",
  scheduled: "実行予定",
  improvement: "改善提案",
  needs_material: "資料が必要",
  error: "エラー",
  ops: "運営からのお知らせ",
  general: "お知らせ",
};

export const NOTICE_PRIORITY_LABELS: Record<NoticePriority, string> = {
  normal: "通常",
  important: "重要",
  urgent: "至急",
};

export type NoticeFilter =
  | "all"
  | "unread"
  | "needs_review"
  | "completed"
  | "improvement"
  | "error";

const ALLOWED_ACTION_PREFIXES = [
  "/workspace",
  "/automations",
  "/projects",
  "/history",
  "/settings",
  "/notifications",
  "/billing",
] as const;

export function isSafeActionUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== "string") return false;
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.startsWith("/owner")) return false;
  return ALLOWED_ACTION_PREFIXES.some(
    (prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`),
  );
}

export function resolveNoticeCategory(
  notification: NotificationRecord,
): NoticeCategory {
  const text = `${notification.title} ${notification.message}`;

  if (/資料.*(必要|不足|提供|追加)|追加の資料|ファイル.*(必要|不足)/.test(text)) {
    return "needs_material";
  }

  switch (notification.type) {
    case "awaiting_review":
      return "needs_review";
    case "completed":
      return "completed";
    case "recommendation":
      return "improvement";
    case "error":
    case "integration":
      return "error";
    case "billing":
      return "ops";
    case "automation":
      if (/予定|次回|カレンダー|リマインダー|実行予定/.test(text)) {
        return "scheduled";
      }
      if (/失敗|エラー|停止/.test(text)) return "error";
      if (/完了/.test(text)) return "completed";
      if (/確認/.test(text)) return "needs_review";
      return "scheduled";
    default:
      return "general";
  }
}

export function resolveNoticePriority(
  notification: NotificationRecord,
  category: NoticeCategory = resolveNoticeCategory(notification),
): NoticePriority {
  const text = `${notification.title} ${notification.message}`;

  if (
    category === "error" &&
    /停止|失敗しました|処理を完了できません|決済失敗|お支払いに失敗/.test(text)
  ) {
    return "urgent";
  }

  if (category === "ops" && /失敗|停止|自動停止/.test(text)) {
    return "urgent";
  }

  if (category === "needs_review" || category === "needs_material") {
    return "important";
  }

  if (category === "error") {
    return "important";
  }

  return "normal";
}

/** Soften stored copy into secretary tone for display (does not mutate storage). */
export function formatNoticeTitle(
  notification: NotificationRecord,
  category: NoticeCategory = resolveNoticeCategory(notification),
): string {
  switch (category) {
    case "needs_review":
      return "ご確認が必要な仕事がございます";
    case "completed":
      return "お仕事が完了しました";
    case "scheduled":
      return "次回の実行予定のご案内";
    case "improvement":
      return "改善のご提案がございます";
    case "needs_material":
      return "追加の資料が必要です";
    case "error":
      return "処理を完了できませんでした";
    case "ops":
      return "運営からのお知らせ";
    default:
      return sanitizeUserFacingText(notification.title) || "お知らせ";
  }
}

export function formatNoticeMessage(
  notification: NotificationRecord,
  category: NoticeCategory = resolveNoticeCategory(notification),
): string {
  const original = sanitizeUserFacingText(notification.message);
  const jobName = extractJobName(notification);

  switch (category) {
    case "needs_review":
      return jobName
        ? `「${jobName}」について、ご確認をお願いいたします。`
        : "ご確認が必要な仕事がございます。内容をご確認ください。";
    case "completed":
      return jobName
        ? `お待たせいたしました。「${jobName}」の作成が完了しました。`
        : "お待たせいたしました。ご依頼の内容が完了しました。";
    case "scheduled":
      return original
        ? `次回の実行予定をご案内します。${original}`
        : "次回の実行予定をご案内します。";
    case "improvement":
      return original
        ? `改善できる可能性のある仕事が見つかりました。${original}`
        : "改善できる可能性のある仕事が見つかりました。";
    case "needs_material":
      return "作業を進めるため、追加の資料をご提供ください。";
    case "error":
      return "処理を完了できませんでした。内容をご確認ください。";
    case "ops":
      return original || "運営よりご案内がございます。";
    default:
      return original || "新しいお知らせがございます。";
  }
}

/** Strip stack traces / internal jargon from user-facing text. */
export function sanitizeUserFacingText(value: string): string {
  return value
    .replace(/at\s+\S+\s+\([^)]+\)/g, "")
    .replace(/Error:\s*/gi, "")
    .replace(/stack\s*trace/gi, "")
    .replace(/OPENAI_[A-Z_]+/g, "")
    .replace(/sk-[a-zA-Z0-9]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 240);
}

export function extractJobName(
  notification: NotificationRecord,
): string | null {
  const fromQuotes = notification.title.match(/「([^」]+)」/);
  if (fromQuotes?.[1]) return fromQuotes[1];

  const fromMessage = notification.message.match(/「([^」]+)」/);
  if (fromMessage?.[1]) return fromMessage[1];

  if (notification.relatedService && notification.relatedService !== "atlas") {
    return null;
  }

  return null;
}

export function getNoticeActionLabel(category: NoticeCategory): string {
  switch (category) {
    case "needs_review":
    case "needs_material":
    case "error":
      return "確認する";
    case "improvement":
      return "提案を見る";
    case "scheduled":
      return "予定を見る";
    case "completed":
      return "結果を見る";
    default:
      return "詳細を見る";
  }
}

export function matchesNoticeFilter(
  notification: NotificationRecord,
  filter: NoticeFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return !notification.isRead;

  const category = resolveNoticeCategory(notification);
  if (filter === "needs_review") return category === "needs_review";
  if (filter === "completed") return category === "completed";
  if (filter === "improvement") return category === "improvement";
  if (filter === "error") return category === "error";
  return true;
}

export function formatNoticeDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
