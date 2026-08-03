import { getWorkQueueStore } from "./store";
import type { StepExecutionResult } from "./steps/execute-step";
import type { WorkJobRecord, WorkStepRecord } from "./types";

/**
 * Load a previously applied side effect for this step idempotency key.
 * Recovery/retry must reuse this instead of re-sending email/post/notify.
 */
export async function loadPriorSideEffect(step: WorkStepRecord): Promise<{
  ok: true;
  outputBindings: Record<string, unknown>;
  artifactIds: string[];
  externalApplied: true;
} | null> {
  const store = getWorkQueueStore();
  const prior = await store.getSideEffect(step.idempotencyKey);
  if (!prior) return null;
  const result = prior.result;
  return {
    ok: true,
    outputBindings: (result.outputBindings as Record<string, unknown>) ?? result,
    artifactIds: Array.isArray(result.artifactIds)
      ? (result.artifactIds as string[])
      : [],
    externalApplied: true,
  };
}

/** Persist successful side-effect evidence under the step idempotency key. */
export async function persistSideEffect(input: {
  job: WorkJobRecord;
  step: WorkStepRecord;
  kind: string;
  result: StepExecutionResult;
}): Promise<void> {
  if (!input.result.ok) return;
  const store = getWorkQueueStore();
  await store.tryRecordSideEffect({
    idempotencyKey: input.step.idempotencyKey,
    jobId: input.job.jobId,
    runId: input.job.runId,
    stepId: input.step.stepId,
    kind: input.kind,
    result: {
      outputBindings: input.result.outputBindings ?? {},
      artifactIds: input.result.artifactIds ?? [],
      externalApplied: Boolean(input.result.externalApplied),
    },
  });
}
