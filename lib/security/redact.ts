/**
 * P0-04: General secret / token / PII redaction for logs and public errors.
 * Pure helpers (no env reads) — safe to reuse from OAuth redactors / tests.
 *
 * Recursive: nested objects, arrays, metadata, Error, and URL query values.
 * Debug identifiers (jobId, diagnosticId, stage, duration, error code) stay.
 */

const SAFE_DEBUG_KEYS = new Set([
  "jobid",
  "job_id",
  "runid",
  "run_id",
  "automationid",
  "automation_id",
  "diagnosticid",
  "diagnostic_id",
  "tickid",
  "tick_id",
  "correlationid",
  "correlation_id",
  "stage",
  "duration",
  "durationms",
  "duration_ms",
  "errorcode",
  "error_code",
  "developercode",
  "developer_code",
  "failureclass",
  "failure_class",
  "success",
  "failure",
  "timeout",
  "abort",
  "code",
  "status",
  "ok",
]);

const SENSITIVE_KEY_EXACT =
  /^(authorization|auth|bearer|cookie|set[_-]?cookie|password|passwd|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|id[_-]?token|token|credential|credentials|encryption[_-]?key|private[_-]?key|service[_-]?role|cron[_-]?secret|webhook[_-]?secret|session|jwt|ciphertext|application[_-]?password)$/i;

const SENSITIVE_KEY_EMBEDDED =
  /(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|private[_-]?key|secret[_-]?key|encryption[_-]?key|service[_-]?role|cron[_-]?secret|webhook[_-]?secret|application[_-]?password)/i;

const TOKENISH =
  /(ya29\.[A-Za-z0-9._\-]+|xox[baprs]-[A-Za-z0-9-]+|sl\.[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|sk-[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9_]+|sk_test_[A-Za-z0-9_]+|rk_live_[A-Za-z0-9_]+|rk_test_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

const ENC_PAYLOAD = /enc:v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+/g;

const EMAILISH =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const CONN_STRING =
  /\b(postgres|postgresql|mysql|mongodb(\+srv)?):\/\/[^\s"']+/gi;

const KEY_VALUE_SECRET =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|token|secret|password|authorization|bearer|credential|encryption[_-]?key)\s*[:=]\s*([^\s"'&,;]+)/gi;

const URL_QUERY_SECRET_KEYS = /^(token|api[_-]?key|key|secret|access_token|refresh_token|id_token|client_secret|password)$/i;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isSensitiveLogKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SAFE_DEBUG_KEYS.has(normalized)) return false;
  // SHA-256 token fingerprints are comparison ids, not secrets.
  if (normalized.endsWith("fingerprint") || normalized.endsWith("_fp")) {
    return false;
  }
  if (SENSITIVE_KEY_EXACT.test(normalized)) return true;
  if (SENSITIVE_KEY_EMBEDDED.test(normalized)) return true;
  return false;
}

function redactUrlQuery(value: string): string {
  const maybeUrl = value.includes("://")
    ? value
    : value.startsWith("/") && value.includes("?")
      ? `https://redact.invalid${value}`
      : value.includes("?") && URL_QUERY_SECRET_KEYS.test(
          value.slice(value.indexOf("?") + 1).split("=")[0] ?? "",
        )
        ? `https://redact.invalid/${value}`
        : null;
  if (!maybeUrl) {
    if (!value.includes("?") && !value.includes("=")) return value;
    try {
      if (value.includes("://")) {
        const url = new URL(value);
        let changed = false;
        for (const [key] of url.searchParams) {
          if (URL_QUERY_SECRET_KEYS.test(key) || isSensitiveLogKey(key)) {
            url.searchParams.set(key, "[redacted]");
            changed = true;
          }
        }
        return changed ? url.toString() : value;
      }
    } catch {
      // fall through
    }
    return value;
  }
  try {
    const url = new URL(maybeUrl);
    let changed = false;
    for (const [key] of url.searchParams) {
      if (URL_QUERY_SECRET_KEYS.test(key) || isSensitiveLogKey(key)) {
        url.searchParams.set(key, "[redacted]");
        changed = true;
      }
    }
    if (!changed) return value;
    if (value.includes("://")) return url.toString();
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function redactString(value: string): string {
  let next = redactUrlQuery(value);
  next = next.replace(ENC_PAYLOAD, "[redacted-ciphertext]");
  next = next.replace(TOKENISH, "[redacted-token]");
  next = next.replace(CONN_STRING, "[redacted-connection]");
  next = next.replace(EMAILISH, "[redacted-email]");
  next = next.replace(KEY_VALUE_SECRET, "$1=[redacted]");
  if (next.length > 120 && /(token|secret|password|authorization|api[_-]?key)/i.test(next)) {
    return "[redacted-long-secretish]";
  }
  return next;
}

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[redacted-depth]";
  if (value == null) return value;

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name,
      message: String(redactSecrets(value.message, depth + 1)),
    };
    const cause = (value as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
      out.cause = redactSecrets(cause, depth + 1);
    }
    return out;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (isSensitiveLogKey(key)) {
        out[key] = "[redacted]";
        continue;
      }
      // Avoid dumping prompt/deliverable bodies into logs.
      if (
        /^(prompt|finalResponse|finalDeliverable|content|body|rawErrorBody|stack|stackTrace)$/i.test(
          key,
        )
      ) {
        out[key] = "[redacted-body]";
        continue;
      }
      out[key] = redactSecrets(nested, depth + 1);
    }
    return out;
  }

  return "[redacted]";
}

export function safeLog(
  level: "warn" | "error" | "info",
  label: string,
  detail?: unknown,
): void {
  const payload = detail === undefined ? undefined : redactSecrets(detail);
  if (payload === undefined) {
    console[level](label);
    return;
  }
  console[level](label, payload);
}

/** Public API error body — never includes stack/env/tokens. */
export function publicErrorBody(input: {
  error: string;
  code?: string;
  diagnosticId?: string | null;
  status?: "error" | "unauthorized" | "forbidden" | "not_found";
}): Record<string, unknown> {
  return {
    ok: false,
    status: input.status ?? "error",
    error: String(redactSecrets(input.error)),
    ...(input.code ? { code: input.code } : {}),
    ...(input.diagnosticId ? { diagnosticId: input.diagnosticId } : {}),
  };
}

export function assertNoSecretMaterial(text: string): boolean {
  if (!text) return true;
  // Avoid lastIndex side effects from /g regex .test()
  if (text.match(TOKENISH)) return false;
  if (text.match(CONN_STRING)) return false;
  if (text.includes("enc:v") && text.match(ENC_PAYLOAD)) return false;
  if (
    /sk_live_|sk_test_|whsec_|SUPABASE_SERVICE_ROLE|CRON_SECRET\s*=/i.test(text)
  ) {
    return false;
  }
  if (/\bapi_key\s*=\s*(?!\[redacted\])\S+/i.test(text)) return false;
  return true;
}
