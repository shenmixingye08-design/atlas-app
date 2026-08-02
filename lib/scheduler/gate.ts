import {
  getSchedulerAliveState,
  hasSchedulerStartEvidence,
} from "./history-store";

export type SchedulerCompletionGateInput = {
  /** When true, this job was scheduled and requires Scheduler start evidence. */
  requireScheduled: boolean;
  jobId?: string | null;
  runId?: string | null;
  scheduleId?: string | null;
};

export type SchedulerCompletionGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      code:
        | "scheduler_stopped"
        | "scheduler_not_started"
        | "missing_schedule_evidence";
    };

/**
 * Fail Closed: scheduled work cannot become completed unless Scheduler started
 * and left start evidence for this job/run/schedule.
 */
export function assertSchedulerAllowsCompletion(
  input: SchedulerCompletionGateInput,
): SchedulerCompletionGateResult {
  if (!input.requireScheduled) {
    return { allowed: true };
  }

  const alive = getSchedulerAliveState();
  if (alive.stopped || !alive.alive || alive.tickCount === 0) {
    return {
      allowed: false,
      reason: "Schedulerが起動していないため completed は禁止です",
      code: "scheduler_stopped",
    };
  }

  if (alive.lastTickOk === false) {
    return {
      allowed: false,
      reason: "直近の Scheduler tick が失敗しているため completed は禁止です",
      code: "scheduler_stopped",
    };
  }

  const hasEvidence = hasSchedulerStartEvidence({
    jobId: input.jobId,
    runId: input.runId,
    scheduleId: input.scheduleId,
  });

  if (!hasEvidence) {
    return {
      allowed: false,
      reason:
        "Scheduler開始証跡がないため completed は禁止です（途中成功禁止）",
      code: "missing_schedule_evidence",
    };
  }

  if (!alive.alive) {
    return {
      allowed: false,
      reason: "Scheduler Alive=false のため completed は禁止です",
      code: "scheduler_not_started",
    };
  }

  return { allowed: true };
}
