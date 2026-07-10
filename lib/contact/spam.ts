import type { ContactSubmissionInput } from "./types";

/** Anti-spam configuration — extend when adding reCAPTCHA etc. */
export const contactSpamConfig = {
  honeypotField: "website" as const,
  minSubmitIntervalMs: 30_000,
  maxSubmissionsPerHour: 5,
  recaptcha: {
    enabled: false,
    /** Env key reserved for future use: CONTACT_RECAPTCHA_SECRET */
    secretEnvKey: "CONTACT_RECAPTCHA_SECRET",
  },
} as const;

export function isHoneypotTriggered(input: ContactSubmissionInput): boolean {
  return input.website.length > 0;
}

export async function verifyRecaptchaIfEnabled(
  _token: string | null | undefined,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!contactSpamConfig.recaptcha.enabled) {
    return { ok: true };
  }

  if (!_token) {
    return { ok: false, reason: "reCAPTCHA の確認が必要です。" };
  }

  // Future: verify token against Google reCAPTCHA API using secret env.
  return { ok: false, reason: "reCAPTCHA は未設定です。" };
}
