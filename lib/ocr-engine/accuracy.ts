import type { OcrAccuracyResult } from "./types";
import { OCR_ACCURACY_THRESHOLD } from "./types";

export function scoreOcrAccuracy(input: {
  extractedText: string;
  tokensExpected: readonly string[];
  threshold?: number;
}): OcrAccuracyResult {
  const text = input.extractedText ?? "";
  const tokensHit = input.tokensExpected.filter((token) =>
    text.includes(token),
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
