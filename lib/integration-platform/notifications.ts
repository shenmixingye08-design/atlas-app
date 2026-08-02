import { createNotification } from "@/lib/notifications/service";

/**
 * Success notifications must include the remote URL — never "posted" without link.
 */
export function notifyIntegrationCompleted(
  userId: string,
  input: {
    serviceLabel: string;
    externalUrl: string;
    externalId?: string | null;
    title?: string;
    relatedService?: string;
  },
) {
  return createNotification({
    audience: "user",
    userId,
    type: "completed",
    title: input.title ?? `${input.serviceLabel}への反映が完了しました`,
    message: `${input.serviceLabel}への反映が完了しました。\n${input.externalUrl}`,
    relatedService: input.relatedService ?? "atlas",
    actionUrl: input.externalUrl,
    requestId: input.externalId ?? undefined,
  });
}

export function notifyIntegrationFailed(
  userId: string,
  input: {
    serviceLabel: string;
    error: string;
    settingsPath?: string;
  },
) {
  return createNotification({
    audience: "user",
    userId,
    type: "error",
    title: `${input.serviceLabel}への反映に失敗しました`,
    message: input.error,
    relatedService: "atlas",
    actionUrl: input.settingsPath ?? "/settings",
    lineEvent: "error",
  });
}
