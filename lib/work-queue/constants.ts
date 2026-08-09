export const WORK_QUEUE_LEASE_MS = 60_000;
export const WORK_QUEUE_HEARTBEAT_MS = 15_000;
export const WORK_QUEUE_STUCK_MS = 90_000;
/** Soft max wall-clock for a single leased execution (clock-skew tolerant). */
export const WORK_QUEUE_MAX_EXECUTION_MS = 10 * 60_000;
/** Grace before reclaiming an expired lease (clock-skew tolerance). */
export const WORK_QUEUE_CLOCK_SKEW_MS = 250;
export const WORK_QUEUE_DEFAULT_MAX_ATTEMPTS = 5;
/**
 * P2-03: reviewed claim batch (was 10 — backlog linear under single-curl drain).
 * Reliability gate requires <= 25; adaptive plan may raise per-call limit separately.
 */
export const WORK_QUEUE_WORKER_BATCH = 20;
export const WORK_QUEUE_SCHEDULER_BATCH = 50;

/** P2-03: default parallel drain workers (horizontal fan-out). */
export const WORK_QUEUE_WORKER_FANOUT_DEFAULT = 3;
/** P2-03: max parallel drain workers under backlog. */
export const WORK_QUEUE_WORKER_FANOUT_MAX = 8;
/** P2-03: adaptive per-worker claim ceiling (backpressure-aware). */
export const WORK_QUEUE_CLAIM_LIMIT_MAX = 40;
/** P2-03: when in-flight work exceeds this, shrink claim/fan-out. */
export const WORK_QUEUE_BACKPRESSURE_IN_FLIGHT = 30;
/** P2-03: queue depth that starts raising fan-out. */
export const WORK_QUEUE_BACKLOG_FANOUT_THRESHOLD = 20;

/** Env: path for file-durable store (tests / local without Postgres). */
export const WORK_QUEUE_FILE_ENV = "ATLAS_WORK_QUEUE_FILE";

/** Env: force file store even if DATABASE_URL exists (tests). */
export const WORK_QUEUE_FORCE_FILE_ENV = "ATLAS_WORK_QUEUE_FORCE_FILE";

/**
 * Env: keep durable semantics in-process without rewriting JSON every mutation.
 * Used for large load tests. Restart-survival tests must leave this unset.
 */
export const WORK_QUEUE_MEMORY_FAST_ENV = "ATLAS_WORK_QUEUE_MEMORY_FAST";
