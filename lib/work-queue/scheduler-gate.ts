/**
 * Fail-closed gate: when Scheduler is stopped/disabled,
 * schedule-triggered jobs must not become `completed`.
 */

let explicitStopped = false;

export function setSchedulerExplicitlyStopped(stopped: boolean): void {
  explicitStopped = stopped;
}

export function isSchedulerExplicitlyStopped(): boolean {
  return explicitStopped;
}

export function isScheduledCronEnabled(): boolean {
  return process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
}

export function isSchedulerAcceptingCompletions(options?: {
  triggerType?: string | null;
}): { allowed: boolean; code: string; message: string } {
  const trigger = options?.triggerType ?? "automation";
  // Manual / fixture drains remain allowed when scheduler is down.
  if (trigger === "manual" || trigger === "fixture") {
    return { allowed: true, code: "ok", message: "non-schedule trigger" };
  }

  if (!isScheduledCronEnabled()) {
    return {
      allowed: false,
      code: "scheduler_disabled",
      message: "ENABLE_SCHEDULED_CRON=false — schedule completed 禁止",
    };
  }

  if (explicitStopped) {
    return {
      allowed: false,
      code: "scheduler_not_running",
      message: "Scheduler 停止中 — schedule completed 禁止",
    };
  }

  return { allowed: true, code: "ok", message: "scheduler accepting" };
}

export function resetSchedulerGateForTests(): void {
  explicitStopped = false;
}
