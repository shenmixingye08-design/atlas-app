import type { NotificationRecord, NotificationTargetType } from "./types";

/**
 * Resolved result target for a notification. The `/results/<notificationId>`
 * route maps `kind` → renderer and uses `targetId` to load the exact outcome.
 * `kind: "none"` means the row carries no target ids at all (legacy /旧形式).
 */
export type ResolvedNotificationTarget =
  | { kind: NotificationTargetType; targetId: string }
  | { kind: "none" };

/**
 * Target types whose result IS a durable 成果物 (project) loaded by id and
 * rendered in full on the results page. Others (automation_run / x_post)
 * resolve to their own detail deep link instead.
 */
const DELIVERABLE_TARGET_TYPES = new Set<NotificationTargetType>([
  "deliverable",
  "workflow_run",
  "analysis",
  "request",
  "accounting_entry",
]);

export function isDeliverableTargetType(
  kind: NotificationTargetType,
): boolean {
  return DELIVERABLE_TARGET_TYPES.has(kind);
}

/** Durable project ids are minted as `commander-*` / `orchestrate-*`. */
function looksLikeProjectId(value: string): boolean {
  return /^(commander|orchestrate|project)[-_]/.test(value);
}

/**
 * Resolve the canonical target of a notification.
 *
 * Order:
 * 1. Explicit `targetType` + `targetId` (new rows) — authoritative.
 * 2. Backward-compatible inference from the individual id fields so older rows
 *    still reach THAT result instead of a list page.
 */
export function resolveNotificationTarget(
  notification: NotificationRecord,
): ResolvedNotificationTarget {
  if (notification.targetType && notification.targetId) {
    return { kind: notification.targetType, targetId: notification.targetId };
  }

  if (notification.deliverableId) {
    return { kind: "deliverable", targetId: notification.deliverableId };
  }

  if (
    notification.relatedService === "x" &&
    (notification.requestId || notification.relatedTaskId)
  ) {
    return {
      kind: "x_post",
      targetId: (notification.requestId ?? notification.relatedTaskId) as string,
    };
  }

  if (notification.automationId) {
    return { kind: "automation_run", targetId: notification.automationId };
  }

  if (
    notification.relatedTaskId &&
    looksLikeProjectId(notification.relatedTaskId)
  ) {
    return { kind: "deliverable", targetId: notification.relatedTaskId };
  }

  if (notification.workflowRunId) {
    return { kind: "workflow_run", targetId: notification.workflowRunId };
  }

  if (notification.requestId) {
    return { kind: "request", targetId: notification.requestId };
  }

  return { kind: "none" };
}

/**
 * Whether「結果を見る」should route through the unified `/results/<id>` route.
 * True when the notification has any resolvable result target — this lets even
 * legacy rows (deliverableId but stale `/projects` actionUrl) upgrade to the
 * self-resolving results page. Automation-only rows keep their working panel
 * deep link, so they are intentionally excluded here.
 */
export function hasResolvableResultTarget(
  notification: NotificationRecord,
): boolean {
  if (notification.targetType && notification.targetId) return true;
  if (notification.deliverableId) return true;
  if (notification.workflowRunId) return true;
  if (
    notification.relatedService === "x" &&
    (notification.requestId || notification.relatedTaskId)
  ) {
    return true;
  }
  if (
    notification.relatedTaskId &&
    looksLikeProjectId(notification.relatedTaskId)
  ) {
    return true;
  }
  return false;
}
