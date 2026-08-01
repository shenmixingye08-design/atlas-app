/**
 * Never log or persist API keys, tokens, cookies, sessions, JWTs, or OAuth secrets.
 */

const SENSITIVE_KEY =
  /(password|passwd|secret|token|cookie|session|authorization|api[_-]?key|access[_-]?key|refresh[_-]?token|client[_-]?secret|bearer|jwt|private[_-]?key|stripe[_-]?(sk|rk|whsec)|clerk[_-]?secret)/i;

const SENSITIVE_INLINE =
  /(password|passwd|secret|token|cookie|session|authorization|api[_-]?key|bearer|jwt)\s*[:=]\s*["']?[^"',\s]{6,}/gi;

const STRIPE_OR_SECRET_TOKEN =
  /\b(sk_live_|sk_test_|rk_live_|rk_test_|whsec_|pk_live_|pk_test_)[A-Za-z0-9]+/g;

const JWT_LIKE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export function redactSecrets(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(JWT_LIKE, "[REDACTED_JWT]")
    .replace(STRIPE_OR_SECRET_TOKEN, "[REDACTED]")
    .replace(SENSITIVE_INLINE, "$1=[REDACTED]")
    .slice(0, 500);
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function sanitizeLogObject(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (typeof value === "string") {
      out[key] = redactSecrets(value);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    } else {
      out[key] = "[omitted]";
    }
  }
  return out;
}

/** Safe console wrapper — never dumps secrets. */
export function secureLog(
  level: "info" | "warn" | "error",
  label: string,
  meta?: Record<string, unknown>,
): void {
  const safe = sanitizeLogObject(meta);
  if (level === "error") {
    console.error(label, safe);
    return;
  }
  if (level === "warn") {
    console.warn(label, safe);
    return;
  }
  console.info(label, safe);
}
