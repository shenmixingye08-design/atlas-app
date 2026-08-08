/**
 * P0-04: General secret / token / PII redaction for logs and public errors.
 * Pure helpers (no env reads) — safe to reuse from OAuth redactors / tests.
 */

const SENSITIVE_KEY =
  /(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|authorization|password|application[_-]?password|ciphertext|api[_-]?key|secret[_-]?key|private[_-]?key|service[_-]?role|cron[_-]?secret|webhook[_-]?secret|^cookie$|set-cookie|^session$|^jwt$|bearer|stripe[_-]?secret|openai[_-]?api[_-]?key|supabase[_-]?service[_-]?role|database[_-]?url|postgres[_-]?url)/i;

const TOKENISH =
  /(ya29\.[A-Za-z0-9._\-]+|xox[baprs]-[A-Za-z0-9-]+|sl\.[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|sk-[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9_]+|sk_test_[A-Za-z0-9_]+|rk_live_[A-Za-z0-9_]+|rk_test_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

const ENC_PAYLOAD = /enc:v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+/g;

const EMAILISH =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const CONN_STRING =
  /\b(postgres|postgresql|mysql|mongodb(\+srv)?):\/\/[^\s"']+/gi;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[redacted-depth]";
  if (value == null) return value;

  if (typeof value === "string") {
    let next = value.replace(ENC_PAYLOAD, "[redacted-ciphertext]");
    next = next.replace(TOKENISH, "[redacted-token]");
    next = next.replace(CONN_STRING, "[redacted-connection]");
    next = next.replace(EMAILISH, "[redacted-email]");
    if (next.length > 120 && /(token|secret|password|authorization)/i.test(next)) {
      return "[redacted-long-secretish]";
    }
    return next;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: String(redactSecrets(value.message, depth + 1)),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEY.test(key)) {
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
  return true;
}
