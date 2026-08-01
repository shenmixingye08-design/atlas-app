/** Unified outbound timeouts (ms). All third-party calls must use these. */
export const RELIABILITY_TIMEOUTS = {
  /** OpenAI / LLM single call */
  openai: 60_000,
  /** X / Twitter API */
  x: 20_000,
  /** Dropbox API */
  dropbox: 20_000,
  /** WordPress REST */
  wordpress: 20_000,
  /** LINE Messaging */
  line: 15_000,
  /** Google APIs */
  google: 20_000,
  /** Default for any other external HTTP */
  external: 20_000,
  /** Browser may wait this long before switching to "accepted" copy */
  uiWaitMax: 3_000,
  /** Server job wall clock for a single work request */
  workJob: 8 * 60_000,
  /** Inbound API request budget */
  request: 60_000,
  /** Max time waiting in queue before stuck classification */
  queueWait: 15 * 60_000,
  /** Worker lease / hang detection (aligned with JOB_HANG_TIMEOUT) */
  worker: 30 * 60_000,
  /** Storage object upload/download */
  storage: 30_000,
  /** Durable DB round-trip soft budget */
  db: 10_000,
  /** Notification channel ACK */
  notification: 15_000,
} as const;

export type ReliabilityTimeoutKey = keyof typeof RELIABILITY_TIMEOUTS;
