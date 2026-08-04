export const WORK_QUEUE_LEASE_MS = 60_000;
export const WORK_QUEUE_HEARTBEAT_MS = 15_000;
export const WORK_QUEUE_STUCK_MS = 90_000;
/** Soft max wall-clock for a single leased execution (clock-skew tolerant). */
export const WORK_QUEUE_MAX_EXECUTION_MS = 10 * 60_000;
/** Grace before reclaiming an expired lease (clock-skew tolerance). */
export const WORK_QUEUE_CLOCK_SKEW_MS = 250;
export const WORK_QUEUE_DEFAULT_MAX_ATTEMPTS = 5;
export const WORK_QUEUE_WORKER_BATCH = 10;
export const WORK_QUEUE_SCHEDULER_BATCH = 50;

/** Env: path for file-durable store (tests / local without Postgres). */
export const WORK_QUEUE_FILE_ENV = "ATLAS_WORK_QUEUE_FILE";

/** Env: force file store even if DATABASE_URL exists (tests). */
export const WORK_QUEUE_FORCE_FILE_ENV = "ATLAS_WORK_QUEUE_FORCE_FILE";

/**
 * Env: keep durable semantics in-process without rewriting JSON every mutation.
 * Used for large load tests. Restart-survival tests must leave this unset.
 */
export const WORK_QUEUE_MEMORY_FAST_ENV = "ATLAS_WORK_QUEUE_MEMORY_FAST";
