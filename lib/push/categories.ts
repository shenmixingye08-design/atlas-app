import type { NotificationType } from "@/lib/notifications/types";

import type { PushEventCategory, PushSeverity } from "./types";
import { DEFAULT_PUSH_EVENTS } from "./types";

/** Map notification type to default push event category. */
export function resolvePushEventCategory(input: {
  type: NotificationType;
  eventCategory?: PushEventCategory | null;
  autoRecovered?: boolean;
}): PushEventCategory {
  if (input.eventCategory) return input.eventCategory;
  if (input.autoRecovered) return "auto_recovered";

  switch (input.type) {
    case "completed":
      return "final_success";
    case "awaiting_review":
      return "approval_needed";
    case "error":
    case "integration":
      return "final_failure";
    case "automation":
      return "final_failure";
    case "billing":
      return "connection_broken";
    case "recommendation":
      return "daily_report";
    default:
      return "final_success";
  }
}

/** Map notification type to default severity. */
export function resolvePushSeverity(input: {
  type: NotificationType;
  severity?: PushSeverity | null;
  eventCategory?: PushEventCategory | null;
}): PushSeverity {
  if (input.severity) return input.severity;

  const category = input.eventCategory ?? resolvePushEventCategory(input);
  switch (category) {
    case "final_failure":
    case "connection_broken":
    case "approval_needed":
      return "critical";
    case "final_success":
    case "auto_recovered":
      return "important";
    case "daily_report":
      return "summary";
    case "job_start":
    case "internal_step":
    case "transient_error":
    case "mid_retry":
      return "info";
    default:
      return "important";
  }
}

/** Whether this event should send push by default (before user prefs). */
export function isDefaultPushEventEnabled(category: PushEventCategory): boolean {
  return DEFAULT_PUSH_EVENTS[category] ?? false;
}

/** Categories that should never trigger push regardless of user toggle. */
export function isSpamCategory(category: PushEventCategory): boolean {
  return (
    category === "job_start" ||
    category === "internal_step" ||
    category === "transient_error" ||
    category === "mid_retry"
  );
}
