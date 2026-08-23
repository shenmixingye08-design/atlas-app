import "server-only";

import { safeLog } from "@/lib/security/redact";

export const WORDPRESS_CONFIGURATION_ERROR_LABEL =
  "WORDPRESS_CONFIGURATION_ERROR" as const;

export type WordPressConfigurationErrorCode = "missing_encryption_key";

type WordPressConfigurationLogInput = {
  code: WordPressConfigurationErrorCode;
  operation: string;
  route?: string | null;
  requestId?: string | null;
};

const emitted = new Set<string>();

/** Test helper — does not reset Production isolate state outside tests. */
export function resetWordPressConfigurationLogForTests(): void {
  emitted.clear();
}

/**
 * Structured, secret-free configuration error. Deduped per isolate so a
 * single request (or warm lambda) cannot spam the same missing-key line.
 */
export function logWordPressConfigurationError(
  input: WordPressConfigurationLogInput,
): void {
  const fingerprint = `${input.code}:${input.operation}:${input.route ?? ""}`;
  if (emitted.has(fingerprint)) return;
  emitted.add(fingerprint);
  safeLog("error", WORDPRESS_CONFIGURATION_ERROR_LABEL, {
    service: "wordpress",
    code: input.code,
    operation: input.operation,
    route: input.route ?? null,
    requestId: input.requestId ?? null,
  });
}
