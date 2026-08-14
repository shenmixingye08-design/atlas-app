/**
 * User-notification policy for Scheduler outcomes.
 * Retry-in-progress must not page the customer.
 */

export type SchedulerUserNotificationKind =
  | "success"
  | "delayed"
  | "retry_silent"
  | "permanent_failure"
  | "none";

export type SchedulerNotificationOutcome =
  | "success"
  | "delayed"
  | "retry"
  | "permanent_failure"
  | "skipped";

export function classifySchedulerUserNotification(
  outcome: SchedulerNotificationOutcome,
): SchedulerUserNotificationKind {
  switch (outcome) {
    case "success":
      return "success";
    case "delayed":
      return "delayed";
    case "retry":
      return "retry_silent";
    case "permanent_failure":
      return "permanent_failure";
    case "skipped":
      return "none";
    default:
      return "none";
  }
}

export function shouldNotifySchedulerUser(
  kind: SchedulerUserNotificationKind,
): boolean {
  return (
    kind === "success" ||
    kind === "delayed" ||
    kind === "permanent_failure"
  );
}
