import type { DeliverableDisplayState } from "@/lib/projects/deliverable-state";

import type { ResultResolutionCode } from "./result-messages";
import {
  isDeliverableTargetType,
  resolveNotificationTarget,
} from "./result-target";
import type { NotificationRecord, NotificationTargetType } from "./types";

/**
 * Durable lookup outcome for a deliverable-family target. Kept as a plain shape
 * (no I/O) so the resolution decision is unit-testable without Supabase.
 */
export type DeliverableLookup =
  | { durable: false }
  | { durable: true; found: false }
  | { durable: true; found: true; displayKind: DeliverableDisplayState["kind"] };

export type ResultDecision =
  | { status: "deliverable"; targetType: NotificationTargetType; targetId: string }
  | { status: "redirect"; url: string }
  | { status: "unavailable"; targetType: NotificationTargetType; targetId: string }
  | { status: "error"; code: ResultResolutionCode; http: number };

/**
 * Pure decision for `/results/<notificationId>`: given the (already loaded)
 * notification, the requester, and — for deliverable targets — the durable
 * lookup, decide exactly what to render. Enforces ownership, order (a target
 * that was never saved → not_saved), legacy handling, and typed failures.
 */
export function decideNotificationResult(input: {
  notification: NotificationRecord | null;
  requesterUserId: string;
  /** Required when the resolved target is a deliverable-family type. */
  lookup?: DeliverableLookup;
}): ResultDecision {
  const { notification, requesterUserId, lookup } = input;

  if (!notification) {
    return { status: "error", code: "not_found", http: 404 };
  }

  // Ownership isolation — a user may only open their own notification's result.
  if (
    notification.audience === "user" &&
    notification.userId !== requesterUserId
  ) {
    return { status: "error", code: "forbidden", http: 403 };
  }

  const target = resolveNotificationTarget(notification);

  if (target.kind === "none") {
    // Legacy row with no target ids — explicit 旧形式 message, never silent.
    return { status: "error", code: "legacy", http: 200 };
  }

  if (target.kind === "automation_run") {
    return {
      status: "redirect",
      url: `/automations?id=${encodeURIComponent(target.targetId)}`,
    };
  }

  if (target.kind === "x_post") {
    return {
      status: "redirect",
      url: `/workspace/x?historyId=${encodeURIComponent(target.targetId)}`,
    };
  }

  if (!isDeliverableTargetType(target.kind)) {
    return { status: "error", code: "unknown", http: 200 };
  }

  // Deliverable-family: needs the durable lookup.
  if (!lookup || !lookup.durable) {
    // No durable backend (dev) — client resolves from its own cache by id.
    return {
      status: "unavailable",
      targetType: target.kind,
      targetId: target.targetId,
    };
  }

  if (!lookup.found) {
    // Order guarantee failed: notified but the 成果物 was never persisted.
    return { status: "error", code: "not_saved", http: 200 };
  }

  switch (lookup.displayKind) {
    case "failed":
      return { status: "error", code: "generation_failed", http: 200 };
    case "generating":
      return { status: "error", code: "pending", http: 200 };
    case "not_found":
      return { status: "error", code: "not_found", http: 200 };
    default:
      return {
        status: "deliverable",
        targetType: target.kind,
        targetId: target.targetId,
      };
  }
}
