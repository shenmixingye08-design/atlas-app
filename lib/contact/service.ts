import { randomUUID } from "crypto";

import { dispatchContactRecord } from "./dispatchers";
import { checkContactRateLimit, recordContactSubmission } from "./rate-limit";
import { isHoneypotTriggered, verifyRecaptchaIfEnabled } from "./spam";
import type { ContactRecord, ContactSubmissionInput, ContactSubmitResult } from "./types";
import {
  normalizeContactSubmission,
  validateContactSubmission,
} from "./validation";

export function resolveClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function submitContactInquiry(
  rawInput: Partial<ContactSubmissionInput>,
  context: { clientIp: string; userAgent: string | null },
): Promise<ContactSubmitResult> {
  const input = normalizeContactSubmission(rawInput);

  if (isHoneypotTriggered(input)) {
    return { ok: true, id: "accepted" };
  }

  const fieldErrors = validateContactSubmission(input);
  if (fieldErrors.length > 0) {
    return {
      ok: false,
      error: "入力内容を確認してください。",
      fieldErrors,
    };
  }

  const recaptcha = await verifyRecaptchaIfEnabled(input.recaptchaToken);
  if (!recaptcha.ok) {
    return { ok: false, error: recaptcha.reason };
  }

  const rateLimit = checkContactRateLimit(context.clientIp);
  if (!rateLimit.allowed) {
    const seconds = Math.ceil((rateLimit.retryAfterMs ?? 30_000) / 1000);
    return {
      ok: false,
      error: `送信が集中しています。${seconds}秒後に再度お試しください。`,
    };
  }

  const record: ContactRecord = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    category: input.category,
    subject: input.subject,
    message: input.message,
    createdAt: new Date().toISOString(),
    clientIp: context.clientIp,
    userAgent: context.userAgent,
  };

  await dispatchContactRecord(record);
  recordContactSubmission(context.clientIp);

  return { ok: true, id: record.id };
}
