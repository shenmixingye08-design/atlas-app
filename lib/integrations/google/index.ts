export { googleServiceDefinition } from "./definition";
export { googleConnector } from "./connector";
export { markGoogleConnectionPending } from "./pending";

export { completeGoogleAccountOAuth, disconnectGoogleAccount } from "./oauth-service";
export { buildGoogleAccountAuthorizeUrl } from "./oauth";
export {
  getGoogleAccountAccessToken,
  getGoogleAccountAccessTokenResult,
} from "./token-manager";
export {
  hasGoogleCapability,
  GOOGLE_INSUFFICIENT_PERMISSION_MESSAGE,
  GOOGLE_RECONNECT_REQUIRED_MESSAGE,
} from "./scopes";

export {
  getGoogleCalendarEventsForUser,
  parseCalendarRangeParam,
  buildCalendarAutomationTriggers,
  resolveCalendarRangeWindow,
} from "./calendar";
export type {
  CalendarEvent,
  CalendarEventsResult,
  CalendarRangeId,
  CalendarAutomationTrigger,
} from "./calendar";

export {
  getGmailMessagesForUser,
  getGmailMessageForUser,
  parseGmailFilterParam,
  analyzeGmailMessages,
  createGmailReplyDraft,
} from "./gmail";
export type {
  GmailMessage,
  GmailMessagesResult,
  GmailFilterId,
  GmailMessageAnalysis,
  GmailReplyDraftContent,
  GmailSavedReplyDraft,
} from "./gmail";

export {
  getGoogleDriveFilesForUser,
  saveDeliverableToGoogleDriveForUser,
  ensureGoogleDriveFoldersForUser,
  parseDriveCategoryParam,
  buildDriveAutomationSaveTrigger,
} from "./drive";
export type {
  DriveFileItem,
  DriveFilesResult,
  DriveCategoryId,
  DriveSaveResult,
  DriveAutomationSaveTrigger,
} from "./drive";
