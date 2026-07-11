const SENSITIVE_PATTERNS: RegExp[] = [
  /\b(?:password|passwd|パスワード)\s*[:=]\s*\S+/i,
  /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*\S+/i,
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  /\b(?:Bearer\s+)[a-zA-Z0-9._-]{20,}\b/,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  /\b(?:cvv|cvc)\s*[:=]\s*\d{3,4}\b/i,
  /(?:決済|クレジット).{0,20}(?:番号|カード)/i,
  /\b(?:my\s?number|マイナンバー)\b/i,
  /\b\d{12}\b/,
];

export function containsSensitiveContent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function sanitizeMemoryText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (containsSensitiveContent(trimmed)) return null;
  return trimmed;
}

export function sanitizeStructuredData(
  data: Record<string, unknown>,
): Record<string, unknown> | null {
  const serialized = JSON.stringify(data);
  if (containsSensitiveContent(serialized)) return null;

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      const safe = sanitizeMemoryText(value);
      if (safe === null && value.trim()) return null;
      if (safe !== null) cleaned[key] = safe;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      cleaned[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      for (const item of value) {
        if (typeof item === "string") {
          const safe = sanitizeMemoryText(item);
          if (safe === null && item.trim()) return null;
          if (safe !== null) items.push(safe);
          continue;
        }
        if (typeof item === "number" || typeof item === "boolean") {
          items.push(item);
          continue;
        }
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const nested = sanitizeStructuredData(item as Record<string, unknown>);
          if (nested === null) return null;
          items.push(nested);
        }
      }
      if (items.length > 0) cleaned[key] = items;
      continue;
    }
    if (value && typeof value === "object") {
      const nested = sanitizeStructuredData(value as Record<string, unknown>);
      if (nested === null) return null;
      cleaned[key] = nested;
    }
  }
  return cleaned;
}
