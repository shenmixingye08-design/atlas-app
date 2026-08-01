import type { VisionEvalCase } from "@/lib/vision-eval/types";
import type { VisionAnalysisResult } from "@/lib/vision/types";

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[¥￥,\s　]/g, "")
    .replace(/-/g, "")
    .toLowerCase();
}

function valuesFromFields(fields: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const value of Object.values(fields)) {
    if (typeof value === "string" && value.trim()) out.push(value);
    else if (typeof value === "number") out.push(String(value));
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") out.push(item);
        else if (item && typeof item === "object") {
          out.push(...valuesFromFields(item as Record<string, unknown>));
        }
      }
    }
  }
  return out;
}

export function haystackFromAnalysis(analysis: VisionAnalysisResult): string {
  const parts = [
    analysis.extractedText ?? "",
    analysis.summary ?? "",
    ...valuesFromFields(analysis.fields ?? {}),
    ...analysis.tables.flatMap((t) => [
      ...(t.headers ?? []),
      ...t.rows.flatMap((row) => row.map((cell) => String(cell ?? ""))),
    ]),
  ];
  return normalize(parts.join(" "));
}

export function fieldHitRate(
  expected: Record<string, string>,
  haystack: string
): { rate: number; hits: string[]; misses: string[] } {
  const hits: string[] = [];
  const misses: string[] = [];
  const keys = Object.keys(expected);
  if (keys.length === 0) return { rate: 1, hits, misses };
  for (const key of keys) {
    const want = normalize(expected[key]!);
    if (want && haystack.includes(want)) hits.push(key);
    else misses.push(key);
  }
  return { rate: hits.length / keys.length, hits, misses };
}

export function readableHitRate(
  expectedReadable: string[],
  haystack: string
): { rate: number; hits: string[]; misses: string[] } {
  const hits: string[] = [];
  const misses: string[] = [];
  if (expectedReadable.length === 0) return { rate: 1, hits, misses };
  for (const token of expectedReadable) {
    const want = normalize(token);
    if (want && haystack.includes(want)) hits.push(token);
    else misses.push(token);
  }
  return { rate: hits.length / expectedReadable.length, hits, misses };
}

/**
 * Vision success: not just HTTP 200.
 * Requires type plausibility, schema-ish content, field coverage, no timeout-as-success.
 */
export function scoreVisionCase(
  c: VisionEvalCase,
  analysis: VisionAnalysisResult | null,
  meta: {
    timedOut: boolean;
    schemaOk: boolean;
    finalStatus: string;
    confidenceMin?: number;
    fieldHitMin?: number;
  }
): {
  ok: boolean;
  ocrOk: boolean;
  fieldHitRate: number;
  readableHitRate: number;
  typeOk: boolean;
  schemaOk: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!analysis) {
    return {
      ok: false,
      ocrOk: false,
      fieldHitRate: 0,
      readableHitRate: 0,
      typeOk: false,
      schemaOk: false,
      reasons: ["no_analysis"],
    };
  }
  if (meta.timedOut) reasons.push("timed_out");
  if (meta.finalStatus === "needs_input" && meta.timedOut) {
    reasons.push("timeout_needs_input_misclassified");
  }

  const haystack = haystackFromAnalysis(analysis);
  const fields = fieldHitRate(c.expectedFields, haystack);
  const readable = readableHitRate(c.expectedReadable, haystack);

  const typeOk =
    analysis.detectedType === c.expectedDocumentType ||
    // ryoshusho cases accept receipt
    (c.category === "ryoshusho" && analysis.detectedType === "receipt") ||
    (c.category === "table_form" &&
      (analysis.detectedType === "table" ||
        analysis.detectedType === "spreadsheet_source" ||
        analysis.detectedType === "business_document"));

  if (!typeOk) reasons.push(`type:${analysis.detectedType}`);
  if (!meta.schemaOk) reasons.push("schema_failed");

  const fieldMin = meta.fieldHitMin ?? 0.5;
  if (fields.rate < fieldMin) {
    reasons.push(`fields:${(fields.rate * 100).toFixed(0)}%<${fieldMin * 100}%`);
  }

  const confMin = meta.confidenceMin ?? 0.35;
  if (analysis.confidence < confMin) reasons.push("low_confidence");

  const hasText =
    Boolean(analysis.extractedText?.trim()) ||
    Object.keys(analysis.fields ?? {}).length > 0 ||
    analysis.tables.length > 0;
  if (!hasText) reasons.push("empty_extraction");

  // OCR success: readable tokens mostly present
  const ocrOk = readable.rate >= 0.6 && hasText;
  if (!ocrOk) reasons.push(`ocr_readable:${(readable.rate * 100).toFixed(0)}%`);

  const ok =
    reasons.filter((r) => r !== `ocr_readable:${(readable.rate * 100).toFixed(0)}%`)
      .length === 0 &&
    typeOk &&
    meta.schemaOk &&
    fields.rate >= fieldMin &&
    !meta.timedOut &&
    hasText;

  // Vision ok can pass with slightly weaker OCR on hard categories, but OCR flag separate
  const visionOk =
    typeOk &&
    meta.schemaOk &&
    fields.rate >= fieldMin &&
    !meta.timedOut &&
    hasText &&
    analysis.confidence >= confMin &&
    !reasons.includes("timeout_needs_input_misclassified");

  return {
    ok: visionOk,
    ocrOk,
    fieldHitRate: fields.rate,
    readableHitRate: readable.rate,
    typeOk,
    schemaOk: meta.schemaOk,
    reasons: visionOk && ocrOk ? [] : reasons,
  };
}

export function charErrorRate(expected: string, actual: string): number {
  const a = normalize(expected);
  const b = normalize(actual);
  if (!a.length) return 0;
  // Levenshtein bounded
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]! / m;
}
