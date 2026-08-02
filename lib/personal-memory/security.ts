import type {
  MemorySensitivity,
  PersonalMemoryScope,
  PersonalMemoryRecord,
} from "@/lib/personal-memory/types";
import {
  RESTRICTED_VALUE_KEYS,
  SENSITIVE_SCOPES,
} from "@/lib/personal-memory/types";

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{10,}/,
  /xox[baprs]-[a-zA-Z0-9-]{10,}/,
  /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/i,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  /\b\d{3}-\d{4}-\d{4}\b/, // my number-ish
];

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?\d{1,3}[-.\s]?)?(?:\d{2,4}[-.\s]?){2,3}\d{3,4}/;

export function detectSecretsInText(text: string): string | null {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) return "secret_pattern";
  }
  return null;
}

export function assertNoSecretsInValue(value: unknown, path = "value"): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const hit = detectSecretsInText(value);
    if (hit) {
      throw new Error(`Memory must not store secrets (${path}: ${hit})`);
    }
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        RESTRICTED_VALUE_KEYS.some((blocked) => lower.includes(blocked.toLowerCase()))
      ) {
        throw new Error(`Memory must not store restricted key: ${key}`);
      }
      assertNoSecretsInValue(child, `${path}.${key}`);
    }
  }
}

export function resolveSensitivity(
  scope: PersonalMemoryScope,
  value: Record<string, unknown>,
): MemorySensitivity {
  if (SENSITIVE_SCOPES.includes(scope)) return "sensitive";
  const serialized = JSON.stringify(value);
  if (EMAIL_PATTERN.test(serialized) || PHONE_PATTERN.test(serialized)) {
    return "sensitive";
  }
  if (
    scope === "contact_info" ||
    scope === "customer_info" ||
    /契約|支払|口座|カード/.test(serialized)
  ) {
    return "restricted";
  }
  return "normal";
}

export function redactForLog(record: Pick<PersonalMemoryRecord, "sensitivity" | "value" | "summary">): {
  summary: string;
  value: Record<string, unknown> | "[redacted]";
} {
  if (record.sensitivity === "normal") {
    return { summary: record.summary, value: record.value };
  }
  return { summary: "[sensitive]", value: "[redacted]" };
}

/** Strip prompt-injection style instructions from candidate text */
export function sanitizeUserFacingMemoryText(text: string): string {
  return text
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "")
    .replace(/system\s*:\s*/gi, "")
    .replace(/<\/?script>/gi, "")
    .trim()
    .slice(0, 2000);
}

export function isExternalContentPoisoning(input: {
  source: string;
  fromAttachment?: boolean;
  fromEmailBody?: boolean;
  fromWeb?: boolean;
}): boolean {
  if (input.source === "external_content") return true;
  return Boolean(input.fromAttachment || input.fromEmailBody || input.fromWeb);
}
