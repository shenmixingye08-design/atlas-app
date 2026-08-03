export { googleGmailLiveAdapter } from "./adapter";
export {
  validateGmailConnection,
  validateGmailScopes,
} from "./connection";
export {
  getGmailAdapterMetrics,
  resetGmailLiveMetricsForTests,
} from "./metrics";
export { resetGmailIdempotencyForTests } from "./idempotency";
export { resolveGmailRecipients } from "./recipients";
export { buildRfc822MimeMessage, encodeMimeForGmailApi } from "./mime";
export { resolveGmailStepInput } from "./input";
export type {
  GmailAdapterResult,
  GmailExternalAction,
  GmailLiveAction,
  GmailStepInput,
  GmailAdapterMetricsSnapshot,
} from "./types";
