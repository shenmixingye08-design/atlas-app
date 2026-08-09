export { CONTACT_CATEGORIES, getContactCategoryLabel, isContactCategoryId } from "./categories";
export { contactDispatchers, dispatchContactRecord } from "./dispatchers";
export { contactSpamConfig } from "./spam";
export { submitContactInquiry, resolveClientIp } from "./service";
export { listContactRecords, resetContactStore } from "./store";
// resetContactRateLimitStore stays server-only (not barrel-exported) to avoid
// pulling distributed rate-limit / server-only into Client Components.
export type {
  ContactCategoryId,
  ContactDispatcher,
  ContactRecord,
  ContactSubmissionInput,
  ContactSubmitResult,
  ContactValidationError,
} from "./types";
