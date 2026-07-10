export { CONTACT_CATEGORIES, getContactCategoryLabel, isContactCategoryId } from "./categories";
export { contactDispatchers, dispatchContactRecord } from "./dispatchers";
export { contactSpamConfig } from "./spam";
export { submitContactInquiry, resolveClientIp } from "./service";
export { listContactRecords, resetContactStore } from "./store";
export { resetContactRateLimitStore } from "./rate-limit";
export type {
  ContactCategoryId,
  ContactDispatcher,
  ContactRecord,
  ContactSubmissionInput,
  ContactSubmitResult,
  ContactValidationError,
} from "./types";
