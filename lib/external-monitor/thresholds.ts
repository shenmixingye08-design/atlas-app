/**
 * P1-07: Centralized alert thresholds.
 * Do not scatter magic numbers across evaluators.
 */

export type AlertSeverity = "warning" | "high" | "critical";

export const EXTERNAL_MONITOR_THRESHOLDS = {
  /** Tick / scheduler */
  tick: {
    warningDelayMs: 5 * 60_000,
    highDelayMs: 10 * 60_000,
    criticalDelayMs: 20 * 60_000,
    consecutiveFailuresWarning: 2,
    consecutiveFailuresHigh: 3,
    consecutiveFailuresCritical: 5,
  },

  /** Automation worker / work-queue */
  worker: {
    dueJobsWarning: 30,
    dueJobsHigh: 80,
    stuckWarning: 1,
    stuckHigh: 3,
    stuckCritical: 8,
    processingStallMs: 10 * 60_000,
    failedRunsWarning: 5,
    failedRunsHigh: 15,
    failedRunsCritical: 40,
    reclaimSpikeWarning: 5,
    reclaimSpikeHigh: 15,
    successRateFloor: 0.95,
    successRateSampleMin: 20,
  },

  /** Notification retry / DLQ */
  notification: {
    pendingRetryWarning: 15,
    pendingRetryHigh: 40,
    pendingRetryCritical: 100,
    dlqGrowthWarning: 3,
    dlqGrowthHigh: 10,
    dlqGrowthCritical: 25,
    deliveryFailureWarning: 5,
    deliveryFailureHigh: 15,
    drainStaleMs: 15 * 60_000,
  },

  /** Side-effect claims */
  sideEffect: {
    pendingStallWarning: 10,
    pendingStallHigh: 30,
    processingStallMs: 15 * 60_000,
    processingStallCountWarning: 3,
    processingStallCountHigh: 10,
    unknownOutcomeWarning: 1,
    unknownOutcomeHigh: 5,
    repeatedFailureWarning: 5,
    repeatedFailureHigh: 20,
  },

  /** DB / API */
  database: {
    // Presence failures are immediately high/critical (infra).
    requiredTableMissingSeverity: "critical" as AlertSeverity,
    requiredRpcMissingSeverity: "critical" as AlertSeverity,
    connectionFailureSeverity: "critical" as AlertSeverity,
  },

  /** External providers (OpenAI etc.) — distinguish from internal */
  external: {
    openErrorWarning: 1,
    openErrorHigh: 3,
    openErrorCritical: 8,
    outageSeverity: "critical" as AlertSeverity,
  },

  /**
   * Notification anti-spam.
   * Same fingerprint must not spam Owner.
   */
  notify: {
    cooldownMsBySeverity: {
      warning: 30 * 60_000,
      high: 15 * 60_000,
      critical: 10 * 60_000,
    } satisfies Record<AlertSeverity, number>,
    continuationMinIntervalMs: 30 * 60_000,
    claimLeaseMs: 60_000,
  },

  /** Evaluation cadence hints */
  eval: {
    minIntervalMs: 30_000,
    checkRunRetentionHours: 72,
  },
} as const;

export function cooldownMsForSeverity(severity: AlertSeverity): number {
  return EXTERNAL_MONITOR_THRESHOLDS.notify.cooldownMsBySeverity[severity];
}
