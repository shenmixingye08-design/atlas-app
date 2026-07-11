/**
 * Never persist passwords, tokens, secrets, cookies, or API keys in audit logs.
 */

const SENSITIVE_KEY =
  /(password|passwd|secret|token|cookie|authorization|api[_-]?key|access[_-]?key|refresh[_-]?token|client[_-]?secret|bearer)/i;

const SENSITIVE_INLINE =
  /(password|passwd|secret|token|cookie|authorization|api[_-]?key)\s*[:=]\s*["']?[^"',\s]+/gi;

export function redactSensitiveText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(SENSITIVE_INLINE, "$1=[REDACTED]").slice(0, 500);
}

export function sanitizeAuditReason(reason: string | null | undefined): string | null {
  return redactSensitiveText(reason);
}

/** Drop sensitive keys from a shallow metadata bag (defensive). */
export function sanitizeAuditMetadata(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "string") {
      out[key] = redactSensitiveText(value);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
