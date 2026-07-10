/** ISO 8601 timestamp. */
export type Timestamp = string;

export type ContactCategoryId =
  | "service"
  | "bug"
  | "billing"
  | "cancellation"
  | "integration"
  | "enterprise"
  | "other";

export type ContactSubmissionInput = {
  name: string;
  email: string;
  category: ContactCategoryId;
  subject: string;
  message: string;
  /** Honeypot — must be empty for legitimate submissions. */
  website: string;
  /** Reserved for future reCAPTCHA integration. */
  recaptchaToken?: string | null;
};

export type ContactRecord = {
  id: string;
  name: string;
  email: string;
  category: ContactCategoryId;
  subject: string;
  message: string;
  createdAt: Timestamp;
  clientIp: string;
  userAgent: string | null;
};

export type ContactValidationError = {
  field: keyof ContactSubmissionInput | "form";
  message: string;
};

export type ContactSubmitResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: ContactValidationError[] };

export type ContactDispatchResult = {
  channel: string;
  ok: boolean;
  detail?: string;
};

export interface ContactDispatcher {
  readonly name: string;
  dispatch(record: ContactRecord): Promise<ContactDispatchResult>;
}
