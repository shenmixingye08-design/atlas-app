export type {
  SchedulerAlert,
  SchedulerAlertId,
  SchedulerAliveState,
  SchedulerExecutionRecord,
  SchedulerExecutionSource,
  SchedulerFailureReason,
  SchedulerHealth,
  SchedulerMetrics,
  SchedulerProofSummary,
  SchedulerQueueSnapshot,
} from "./types";

export {
  classifySchedulerFailure,
  failureReasonLabel,
} from "./failure-classify";
export {
  appendSchedulerExecution,
  findSchedulerExecution,
  getSchedulerAliveState,
  hasSchedulerStartEvidence,
  listQueueDepthSamples,
  listSchedulerHistory,
  markSchedulerJobStarted,
  markSchedulerStopped,
  recordQueueDepthSample,
  resetSchedulerStoreForTests,
} from "./history-store";
export {
  beginSchedulerTick,
  finishSchedulerTick,
  noteSchedulerJobStarted,
  recordSchedulerExecution,
} from "./record";
export {
  buildSchedulerProofSummary,
  computeSchedulerMetrics,
} from "./metrics";
export { buildSchedulerHealth } from "./health";
export {
  evaluateSchedulerAlerts,
  SCHEDULER_QUEUE_GROWTH_THRESHOLD,
  SCHEDULER_SUCCESS_RATE_THRESHOLD,
} from "./alerts";
export {
  assertSchedulerAllowsCompletion,
  type SchedulerCompletionGateInput,
  type SchedulerCompletionGateResult,
} from "./gate";
export { getSchedulerQueueSnapshot } from "./queue";
export { buildScheduleId, getSchedulerWorkerId } from "./worker-id";
