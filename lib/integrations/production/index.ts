export {
  createIntegrationDiagnosticId,
  createIntegrationRequestId,
  listIntegrationAuditRecords,
  recordIntegrationAudit,
  resetIntegrationAuditForTests,
  summarizeIntegrationAudit,
} from "./audit";
export {
  getProductionConnector,
  listProductionConnectors,
  PRODUCTION_CONNECTORS,
  registerProductionConnector,
} from "./connector-registry";
export {
  runIntegrationAction,
  type IntegrationExecutionResult,
} from "./execute";
export {
  buildIdempotencyKey,
  getIdempotentResult,
  resetIntegrationIdempotencyForTests,
  saveIdempotentResult,
} from "./idempotency";
export { cancelExternalServiceOAuth } from "./oauth-cancel";
export {
  listOAuthLifecycleEvents,
  markOAuthCancelled,
  phaseForTokenStatus,
  recordOAuthLifecycleEvent,
  resetOAuthLifecycleForTests,
} from "./oauth-lifecycle";
export {
  classifyIntegrationError,
  computeBackoffDelayMs,
  IntegrationHttpError,
  withIntegrationRetry,
} from "./retry";
export type {
  IntegrationActionResult,
  IntegrationAuditRecord,
  OAuthLifecycleEvent,
  OAuthLifecyclePhase,
  ProductionConnectorDefinition,
  ProductionIntegrationId,
  RunIntegrationOptions,
} from "./types";

export { postTweetProduction } from "./x/post-production";
export { normalizeTweetText } from "./x/text-normalize";
export { uploadXImageMedia } from "./x/media";
export { sendGmailProduction } from "./gmail/compose";
export { mutateCalendarProduction } from "./calendar/events-production";
export { publishWordPressProduction } from "./wordpress/post-production";
export {
  downloadDropboxProduction,
  ensureFolderProduction,
  saveDropboxProduction,
} from "./dropbox/files-production";
