import type { SchedulerFailureReason } from "./types";

const RULES: Array<{ reason: SchedulerFailureReason; pattern: RegExp }> = [
  {
    reason: "timeout",
    pattern: /timeout|timed?\s*out|ETIMEDOUT|hang_timeout|締め切り/i,
  },
  {
    reason: "worker_busy",
    pattern: /worker.?busy|busy|capacity|並行|混雑|lease/i,
  },
  {
    reason: "queue_full",
    pattern: /queue.?full|queue.?overflow|満杯|backpressure|too many/i,
  },
  {
    reason: "storage",
    pattern: /storage|supabase|s3|upload|persist|保存|object.?stor/i,
  },
  {
    reason: "external_api",
    pattern:
      /external.?api|openai|stripe|x\.com|twitter|429|502|503|504|rate.?limit|network|ECONNRESET/i,
  },
  {
    reason: "permission",
    pattern:
      /permission|unauthorized|forbidden|403|401|oauth|権限|認証|access.?denied/i,
  },
];

/** Classify scheduler/job failure into a stable operational bucket. */
export function classifySchedulerFailure(
  error: unknown,
): SchedulerFailureReason {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? `${error.name} ${error.message}`
        : String(error ?? "");

  for (const rule of RULES) {
    if (rule.pattern.test(message)) return rule.reason;
  }
  return "unknown";
}

export function failureReasonLabel(reason: SchedulerFailureReason): string {
  switch (reason) {
    case "timeout":
      return "Timeout";
    case "worker_busy":
      return "Worker Busy";
    case "queue_full":
      return "Queue Full";
    case "storage":
      return "Storage";
    case "external_api":
      return "External API";
    case "permission":
      return "Permission";
    case "unknown":
      return "Unknown";
  }
}
