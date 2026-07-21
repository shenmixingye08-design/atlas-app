/** Default client-side watchdog (slightly above commander/orchestrate client timeout). */
export const EXECUTION_TIMEOUT_MS = 190_000;

/** Auto-retry budget for transient client/network failures. */
export const EXECUTION_MAX_RETRIES = 2;

/** How many recent execution records to keep in local storage. */
export const EXECUTION_STATE_RETENTION = 20;

/** Max log lines kept per execution. */
export const EXECUTION_LOG_LIMIT = 40;

export const EXECUTION_STORAGE_KEY = "minervot.execution-reliability.v1";
