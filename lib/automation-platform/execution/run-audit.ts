import { appendAutomationAudit } from "@/lib/automation-platform/audit/log";

/**
 * Structured execution audit — RequestId/RunId/StepId/Retry/Duration/Cost/Failure.
 * Never logs tokens or PII payloads.
 */
export function auditRunStepEvent(input: {
  requestId: string;
  runId: string;
  automationId: string;
  userId: string;
  stepId: string;
  capabilityId: string;
  attempt: number;
  durationMs: number;
  outcome: "success" | "error" | "denied";
  errorCode?: string | null;
  costUsd?: number | null;
  retryable?: boolean;
}): void {
  appendAutomationAudit({
    actorUserId: input.userId,
    action: "automation.run.step",
    automationId: input.automationId,
    runId: input.runId,
    outcome: input.outcome,
    errorCode: input.errorCode ?? null,
    meta: {
      requestId: input.requestId,
      stepId: input.stepId,
      capabilityId: input.capabilityId,
      retry: input.attempt,
      durationMs: input.durationMs,
      costUsd: input.costUsd ?? null,
      failure: input.outcome === "error",
      retryable: input.retryable ?? false,
    },
  });
}

export function auditRunTerminalEvent(input: {
  requestId: string;
  runId: string;
  automationId: string;
  userId: string;
  status: string;
  durationMs: number | null;
  costUsd: number | null;
  failedStepId: string | null;
  errorCode: string | null;
}): void {
  appendAutomationAudit({
    actorUserId: input.userId,
    action: "automation.run.terminal",
    automationId: input.automationId,
    runId: input.runId,
    outcome:
      input.status === "succeeded" || input.status === "partially_succeeded"
        ? "success"
        : "error",
    errorCode: input.errorCode,
    meta: {
      requestId: input.requestId,
      status: input.status,
      durationMs: input.durationMs,
      costUsd: input.costUsd,
      failedStepId: input.failedStepId,
      stepId: input.failedStepId,
    },
  });
}
