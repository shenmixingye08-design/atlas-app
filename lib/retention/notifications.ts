import { loadRetentionState, saveRetentionState } from "./store";

/**
 * Retention notification policy — spam forbidden.
 * Only: deliverable complete / suggestion / Memory / Automation complete.
 */
export const RETENTION_ALLOWED_NOTIFICATION_TYPES = [
  "deliverable",
  "suggestion",
  "memory",
  "automation",
] as const;

export type RetentionNotificationType =
  (typeof RETENTION_ALLOWED_NOTIFICATION_TYPES)[number];

export type RetentionLocalNotification = {
  type: RetentionNotificationType;
  title: string;
  message: string;
  href: string;
  at: string;
};

const EVENT_NAME = "atlas:retention-notify";

/** At most one notification per type per calendar day. */
export function emitRetentionNotification(
  type: RetentionNotificationType,
  input: { title: string; message: string; href: string },
  now: Date = new Date(),
): RetentionLocalNotification | null {
  const state = loadRetentionState();
  const dayKey = now.toISOString().slice(0, 10);
  const last = state.notificationsSent[type];
  if (last && last.slice(0, 10) === dayKey) {
    return null;
  }

  const payload: RetentionLocalNotification = {
    type,
    title: input.title,
    message: input.message,
    href: input.href,
    at: now.toISOString(),
  };

  saveRetentionState({
    notificationsSent: {
      ...state.notificationsSent,
      [type]: payload.at,
    },
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
  }

  return payload;
}

export function notifyFirstDeliverableComplete(href: string): RetentionLocalNotification | null {
  return emitRetentionNotification("deliverable", {
    title: "成果物が完成しました",
    message: "初回の仕事が終わりました。内容をご確認ください。",
    href,
  });
}

export function notifyRetentionSuggestion(href: string): RetentionLocalNotification | null {
  return emitRetentionNotification("suggestion", {
    title: "次はこれを自動化できます",
    message: "習慣的な作業を、もう一手間減らせます。",
    href,
  });
}

export function notifyMemoryLearning(href = "/settings/memory"): RetentionLocalNotification | null {
  return emitRetentionNotification("memory", {
    title: "Memoryを学習しました",
    message: "好みを反映し、次回からの説明を減らします。",
    href,
  });
}

export function notifyAutomationDone(href: string): RetentionLocalNotification | null {
  return emitRetentionNotification("automation", {
    title: "Automationが完了しました",
    message: "自動実行が終了しました。成果物をご確認ください。",
    href,
  });
}
