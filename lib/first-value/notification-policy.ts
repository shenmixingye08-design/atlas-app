import type { NotificationRecord } from "@/lib/notifications/types";

/**
 * Secretary inbox: only work-completion oriented notifications.
 * 成果物完成 / Automation成功 / Memory改善 — no ads.
 */

const AD_LIKE =
  /キャンペーン|セール|割引|クーポン|アップグレード.*お得|今だけ|広告|プロモ|無料トライアル|限定オファー/;

export function isSecretaryWorkNotification(
  notification: Pick<NotificationRecord, "type" | "title" | "message">,
): boolean {
  const text = `${notification.title} ${notification.message}`;
  if (AD_LIKE.test(text)) return false;

  if (notification.type === "completed") return true;

  if (notification.type === "automation") {
    return /成功|完了|終わりました|終了しました/.test(text);
  }

  if (notification.type === "recommendation") {
    return /自動化|Memory|記憶|改善|任せ/.test(text);
  }

  // Memory改善 may arrive as recommendation or automation-adjacent copy.
  if (/Memory.*(改善|更新|反映)|記憶.*(改善|更新|反映)/.test(text)) {
    return true;
  }

  return false;
}

export function filterSecretaryNotifications<T extends NotificationRecord>(
  notifications: T[],
): T[] {
  return notifications.filter(isSecretaryWorkNotification);
}
