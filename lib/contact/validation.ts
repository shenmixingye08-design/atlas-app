import { isContactCategoryId } from "./categories";
import type { ContactSubmissionInput, ContactValidationError } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LENGTH = 10;

export function validateContactSubmission(
  input: Partial<ContactSubmissionInput>,
): ContactValidationError[] {
  const errors: ContactValidationError[] = [];

  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) {
    errors.push({ field: "email", message: "メールアドレスを入力してください。" });
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push({ field: "email", message: "有効なメールアドレスを入力してください。" });
  }

  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  if (!subject) {
    errors.push({ field: "subject", message: "件名を入力してください。" });
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) {
    errors.push({ field: "message", message: "本文を入力してください。" });
  } else if (message.length < MIN_MESSAGE_LENGTH) {
    errors.push({
      field: "message",
      message: `本文は${MIN_MESSAGE_LENGTH}文字以上で入力してください。`,
    });
  }

  const category = typeof input.category === "string" ? input.category : "";
  if (!category || !isContactCategoryId(category)) {
    errors.push({ field: "category", message: "問い合わせ種別を選択してください。" });
  }

  return errors;
}

export function normalizeContactSubmission(
  input: Partial<ContactSubmissionInput>,
): ContactSubmissionInput {
  return {
    name: typeof input.name === "string" ? input.name.trim() : "",
    email: typeof input.email === "string" ? input.email.trim() : "",
    category: isContactCategoryId(String(input.category ?? ""))
      ? (input.category as ContactSubmissionInput["category"])
      : "other",
    subject: typeof input.subject === "string" ? input.subject.trim() : "",
    message: typeof input.message === "string" ? input.message.trim() : "",
    website: typeof input.website === "string" ? input.website.trim() : "",
    recaptchaToken:
      typeof input.recaptchaToken === "string" ? input.recaptchaToken.trim() : null,
  };
}
