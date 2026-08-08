/**
 * OAuth-focused redaction — delegates to the general P0-04 redactor
 * so access/refresh tokens, Bearer headers, ciphertext, and API keys
 * are stripped consistently before logs / diagnostics.
 */

import { redactSecrets, safeLog } from "@/lib/security/redact";

export function redactOAuthSecrets(value: unknown, depth = 0): unknown {
  void depth;
  return redactSecrets(value);
}

/** Safe console helper — never prints token fields. */
export function safeOAuthLog(
  level: "warn" | "error" | "info",
  label: string,
  detail?: unknown,
): void {
  safeLog(level, label, detail);
}
