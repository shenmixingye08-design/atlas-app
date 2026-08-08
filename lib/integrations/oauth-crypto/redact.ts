/**
 * Strip OAuth token material from values before logging / API error surfaces.
 * Never log access_token / refresh_token / bearer secrets.
 */

const SENSITIVE_KEY =
  /^(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|authorization|password|application[_-]?password|ciphertext)$/i;

const TOKENISH =
  /\b(ya29\.|xox[baprs]-|sl\.[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,})\b/i;

const ENC_PAYLOAD = /enc:v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+/g;

export function redactOAuthSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[redacted-depth]";
  if (value == null) return value;

  if (typeof value === "string") {
    let next = value.replace(ENC_PAYLOAD, "[redacted-ciphertext]");
    if (TOKENISH.test(next) || next.length > 80 && /token/i.test(next)) {
      next = next.replace(TOKENISH, "[redacted-token]");
    }
    // Long opaque secrets (typical OAuth tokens) when labeled nearby are handled via keys.
    return next;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: String(redactOAuthSecrets(value.message, depth + 1)),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactOAuthSecrets(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactOAuthSecrets(nested, depth + 1);
    }
    return out;
  }

  return "[redacted]";
}

/** Safe console helper — never prints token fields. */
export function safeOAuthLog(
  level: "warn" | "error" | "info",
  label: string,
  detail?: unknown,
): void {
  const payload =
    detail === undefined ? undefined : redactOAuthSecrets(detail);
  if (payload === undefined) {
    console[level](label);
    return;
  }
  console[level](label, payload);
}
