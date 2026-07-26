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
} as const;

export type ReliabilityTimeoutKey = keyof typeof RELIABILITY_TIMEOUTS;
