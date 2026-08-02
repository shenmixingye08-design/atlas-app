/** Schedule reliability platform constants (V2 worker + scheduler). */

/** Target schedule accuracy SLA. */
export const SCHEDULE_SLA_MS = 60_000;

/** Lease TTL — worker must heartbeat before expiry or another worker may reclaim. */
export const RUN_LEASE_TTL_MS = 90_000;

/** Heartbeat interval hint (executor should refresh at least this often). */
export const RUN_HEARTBEAT_INTERVAL_MS = 30_000;

/** Running without heartbeat longer than this ⇒ hung → recovery. */
export const RUN_HANG_TIMEOUT_MS = 3 * 60_000;

/** Max attempts before permanent failed (never infinite). */
export const RUN_MAX_ATTEMPTS = 5;

/** Scheduler considered stopped if no successful tick within this window. */
export const SCHEDULER_STALE_MS = 2 * 60_000;

/** Worker considered stopped if no claim/heartbeat within this window. */
export const WORKER_STALE_MS = 3 * 60_000;

/** Default due scan / dispatch batch sizes per tick. */
export const DUE_BATCH_LIMIT = 100;
export const DISPATCH_BATCH_LIMIT = 50;

/** Metrics ring buffer size. */
export const METRICS_SAMPLE_LIMIT = 2_000;

/** Execution event log size. */
export const EXECUTION_EVENT_LIMIT = 2_000;

export const RELIABILITY_GLOBAL_USER_ID = "__atlas_scheduler_reliability__";
export const RELIABILITY_GLOBAL_DOMAIN_KEY = "atlasSchedulerReliability";
