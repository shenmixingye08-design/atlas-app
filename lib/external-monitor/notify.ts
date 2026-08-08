/**
 * P1-07 Owner alert delivery.
 * Real channels only — console.log is never treated as success.
 * Never include secrets in message bodies.
 */

import "server-only";

import { notifyOwnerSystemIncident } from "@/lib/notifications/emitters";
import { isLineMessagingConfigured } from "@/lib/integrations/line/config";

import type { AlertDeliveryKind, AlertIncident } from "./types";

export type OwnerNotifyResult = {
  lineAttempted: boolean;
  lineSent: boolean;
  systemAttempted: boolean;
  systemSent: boolean;
  errorCode: string | null;
};

function redact(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .slice(0, 900);
}

function kindLabel(kind: AlertDeliveryKind): string {
  switch (kind) {
    case "opened":
      return "発生";
    case "continuation":
      return "継続";
    case "resolved":
      return "復旧";
  }
}

export function buildOwnerAlertText(input: {
  incident: AlertIncident;
  deliveryKind: AlertDeliveryKind;
}): string {
  const phase = kindLabel(input.deliveryKind);
  const cls =
    input.incident.failureClass === "external_provider"
      ? "外部provider"
      : input.incident.failureClass === "internal"
        ? "内部"
        : input.incident.failureClass;
  return redact(
    [
      `【MINERVOT監視:${phase}】`,
      `severity=${input.incident.severity}`,
      `check=${input.incident.checkId}`,
      `class=${cls}`,
      `incident=${input.incident.id}`,
      input.incident.title,
      input.incident.summary,
    ].join("\n"),
  );
}

export async function deliverOwnerAlert(input: {
  incident: AlertIncident;
  deliveryKind: AlertDeliveryKind;
}): Promise<OwnerNotifyResult> {
  const text = buildOwnerAlertText(input);
  const result: OwnerNotifyResult = {
    lineAttempted: false,
    lineSent: false,
    systemAttempted: false,
    systemSent: false,
    errorCode: null,
  };

  // 1) LINE — primary real Owner reach path when configured.
  const ownerLineUserId = process.env.ATLAS_OWNER_LINE_USER_ID?.trim();
  if (ownerLineUserId && isLineMessagingConfigured()) {
    result.lineAttempted = true;
    try {
      const { pushLineTextMessage } = await import(
        "@/lib/integrations/line/messaging"
      );
      await pushLineTextMessage({
        lineUserId: ownerLineUserId,
        text,
      });
      result.lineSent = true;
    } catch (error) {
      result.errorCode =
        error instanceof Error ? error.name.slice(0, 80) : "line_push_failed";
    }
  }

  // 2) Owner system notification (durable inbox when backend ready).
  result.systemAttempted = true;
  try {
    await notifyOwnerSystemIncident(text.slice(0, 400));
    result.systemSent = true;
  } catch {
    if (!result.errorCode) result.errorCode = "system_notify_failed";
  }

  return result;
}

/** True when at least one real Owner channel accepted the alert. */
export function ownerNotifySucceeded(result: OwnerNotifyResult): boolean {
  return result.lineSent || result.systemSent;
}
