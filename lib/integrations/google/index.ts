export { googleServiceDefinition } from "./definition";
export { googleConnector } from "./connector";
export { markGoogleConnectionPending } from "./pending";

export { completeGoogleAccountOAuth, disconnectGoogleAccount } from "./oauth-service";
export { buildGoogleAccountAuthorizeUrl } from "./oauth";
export { getGoogleAccountAccessToken } from "./token-manager";

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
