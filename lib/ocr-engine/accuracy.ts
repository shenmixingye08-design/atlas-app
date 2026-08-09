import type { OcrAccuracyResult } from "./types";
import { OCR_ACCURACY_THRESHOLD } from "./types";

function normalizeOcrHaystack(text: string): string {
  return text
    .toUpperCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenMatches(haystack: string, token: string): boolean {
  const h = normalizeOcrHaystack(haystack);
  const t = normalizeOcrHaystack(token);
  if (h.includes(t)) return true;
  // Allow OCR dropping hyphens: ATLAS-OCR-7842 ↔ ATLAS OCR 7842 / ATLASOCR7842
  const compactH = h.replace(/[\s-]/g, "");
  const compactT = t.replace(/[\s-]/g, "");
  return compactH.includes(compactT);
}

export function scoreOcrAccuracy(input: {
  extractedText: string;
  tokensExpected: readonly string[];
  threshold?: number;
}): OcrAccuracyResult {
  const text = input.extractedText ?? "";
  const tokensHit = input.tokensExpected.filter((token) =>
    tokenMatches(text, token),
  );
  const accuracy =
    input.tokensExpected.length === 0
      ? 0
      : tokensHit.length / input.tokensExpected.length;
  const threshold = input.threshold ?? OCR_ACCURACY_THRESHOLD;
  return {
    tokensExpected: [...input.tokensExpected],
    tokensHit: [...tokensHit],
    accuracy,
    accuracyGateOk: accuracy >= threshold,
  };
}

/** Redact secrets / long payloads before durable persist or public logs. */
export function redactOcrText(value: string, max = 500): string {
  return value
    .replace(/sk-[a-zA-Z0-9-_]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[redacted]")
    .slice(0, max);
}
