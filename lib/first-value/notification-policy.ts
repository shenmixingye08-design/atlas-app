import type { NotificationType } from "@/lib/notifications/types";

/**
 * First-value / activation inbox: only work-complete signals.
 * Ads / recommendation spam forbidden.
 */
export const FIRST_VALUE_ALLOWED_NOTIFICATION_TYPES: readonly NotificationType[] =
  ["completed", "automation"] as const;

/** Memory improvement is surfaced via prefs overlay; treat as allowed label. */
export const FIRST_VALUE_ALLOWED_LABELS = [
  "成果物完成",
  "Automation成功",
  "Memory改善",
] as const;

export function isFirstValueNotificationAllowed(
  type: NotificationType,
): boolean {
  if (type === "recommendation" || type === "billing") return false;
  return (FIRST_VALUE_ALLOWED_NOTIFICATION_TYPES as readonly string[]).includes(
    type,
  );
}

export function filterFirstValueNotifications<
  T extends { type: NotificationType },
>(items: T[]): T[] {
  return items.filter((item) => isFirstValueNotificationAllowed(item.type));
}
