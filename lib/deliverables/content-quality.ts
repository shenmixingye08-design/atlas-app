import {
  WORD_CONTENT_MAX_RETRIES,
  WORD_CONTENT_MIN_CHARS,
} from "./constants";
import type { DeliverableFormat } from "./types";

export type ContentQualityIssue =
  | "empty"
  | "too_short"
  | "json_only"
  | "html_error"
  | "truncated"
  | "headings_only"
  | "system_message"
  | "placeholder"
  | "extreme_repetition"
  | "no_body_language"
  /** P2-02 format-specific */
  | "xlsx_insufficient_structure"
  | "pptx_insufficient_structure"
  | "pdf_insufficient_body";

export type ContentQualityResult =
  | { ok: true; text: string }
  | { ok: false; issues: ContentQualityIssue[]; message: string };

const PLACEHOLDER_PATTERNS = [
  /\[あなたの[^\]]+\]/g,
  /\[挿入[^\]]*\]/g,
  /\[TODO[^\]]*\]/gi,
  /\[PLACEHOLDER[^\]]*\]/gi,
  /\{\{[^{}]+\}\}/g,
  /TBD|lorem ipsum|ここに本文/gi,
  /生成中\.\.\.|processing\.\.\.|generating\.\.\./gi,
];

const SYSTEM_LEAK_PATTERNS = [
  /system prompt/i,
  /you are (?:an? )?(?:AI|assistant|GPT)/i,
  /OPENAI_API_KEY|CLERK_SECRET|SUPABASE_SERVICE_ROLE/i,
  /<\/?(?:system|assistant|tool)>/i,
  /as an AI language model/i,
];

const HTML_ERROR_PATTERNS = [
  /^<!DOCTYPE\s+html/i,
  /<html[\s>]/i,
  /<title>\s*(?:error|500|502|503|404)/i,
  /internal server error/i,
  /application error/i,
];

const OFFICE_FORMATS: readonly DeliverableFormat[] = [
  "docx",
  "pdf",
  "xlsx",
  "pptx",
];

function stripMarkdownNoise(text: string): string {
  return text
    .replace(/^#{1,6}\s+.+$/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeJsonOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return (
      /"(?:type|content|summary|title|error|message)"\s*:/.test(trimmed) &&
      trimmed.includes("{") &&
      trimmed.includes("}")
    );
  }
}

function detectExtremeRepetition(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 120) return false;

  const window = Math.min(40, Math.floor(normalized.length / 5));
  if (window < 20) return false;
  const chunk = normalized.slice(0, window);
  let count = 0;
  let idx = 0;
  while (idx <= normalized.length - window) {
    if (normalized.slice(idx, idx + window) === chunk) {
      count += 1;
      idx += window;
    } else {
      idx += 1;
    }
    if (count >= 8) return true;
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 12);
  if (lines.length >= 10) {
    const freq = new Map<string, number>();
    for (const line of lines) {
      freq.set(line, (freq.get(line) ?? 0) + 1);
      if ((freq.get(line) ?? 0) >= 8) return true;
    }
  }
  return false;
}

function looksTruncated(text: string): boolean {
  const trimmed = text.trimEnd();
  if (trimmed.length < WORD_CONTENT_MIN_CHARS) return false;
  if (/(\.\.\.|…|［続き］|（続く）)\s*$/.test(trimmed)) return true;
  const last = trimmed.slice(-1);
  if (!/[。．.！？!?\n」』）)\]]$/.test(last) && trimmed.length < 400) {
    if (/[はがをにでと]$/.test(trimmed)) return true;
  }
  const fences = (trimmed.match(/```/g) ?? []).length;
  if (fences % 2 === 1) return true;
  return false;
}

function headingsOnly(text: string): boolean {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  const bodyLines = lines.filter(
    (l) => !/^#{1,6}\s+/.test(l) && !/^[-*_]{3,}$/.test(l),
  );
  const body = stripMarkdownNoise(bodyLines.join("\n"));
  return body.length < WORD_CONTENT_MIN_CHARS;
}

function hasRequiredLanguage(text: string): boolean {
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= WORD_CONTENT_MIN_CHARS;
}

function collectCommonIssues(text: string): ContentQualityIssue[] {
  const issues: ContentQualityIssue[] = [];
  if (looksLikeJsonOnly(text)) issues.push("json_only");

  for (const pattern of HTML_ERROR_PATTERNS) {
    if (pattern.test(text)) {
      issues.push("html_error");
      break;
    }
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      issues.push("placeholder");
      break;
    }
  }

  for (const pattern of SYSTEM_LEAK_PATTERNS) {
    if (pattern.test(text)) {
      issues.push("system_message");
      break;
    }
  }

  if (detectExtremeRepetition(text)) issues.push("extreme_repetition");
  if (looksTruncated(text)) issues.push("truncated");
  if (headingsOnly(text)) issues.push("headings_only");

  const body = stripMarkdownNoise(text);
  if (body.length < WORD_CONTENT_MIN_CHARS) {
    if (!issues.includes("headings_only") && !issues.includes("too_short")) {
      issues.push("too_short");
    }
  }

  if (!hasRequiredLanguage(text)) issues.push("no_body_language");
  return issues;
}

/**
 * Shared content gate for all deliverable formats (P2-02).
 * Word-only historically — now the common baseline for pdf/xlsx/pptx too.
 */
export function validateCommonSourceContent(raw: string): ContentQualityResult {
  const text = raw?.trim() ?? "";
  if (!text) {
    return {
      ok: false,
      issues: ["empty"],
      message: "文書内容が空です。",
    };
  }
  const issues = collectCommonIssues(text);
  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      message:
        "成果物変換の前に、文書内容の作成で問題が発生しました。入力内容は保存されています。再実行してください。",
    };
  }
  return { ok: true, text };
}

function hasSpreadsheetStructure(text: string): boolean {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const pipeRows = lines.filter((l) => (l.match(/\|/g) ?? []).length >= 2);
  if (pipeRows.length >= 2) return true;
  const tsvRows = lines.filter((l) => l.includes("\t") && l.split("\t").length >= 2);
  if (tsvRows.length >= 2) return true;
  const csvLike = lines.filter((l) => (l.match(/,/g) ?? []).length >= 2);
  if (csvLike.length >= 3) return true;
  const bullets = lines.filter((l) => /^[-*+]\s+\S+/.test(l) || /^\d+[.)]\s+\S+/.test(l));
  if (bullets.length >= 3) return true;
  // Amount / metric dense business text (家計・売上など)
  const numericHits = (text.match(/\d{1,3}(?:,\d{3})+|\d+\.\d+|¥\s*\d+|円/g) ?? [])
    .length;
  if (numericHits >= 3 && stripMarkdownNoise(text).length >= WORD_CONTENT_MIN_CHARS) {
    return true;
  }
  return false;
}

function hasSlideStructure(text: string): boolean {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const headings = lines.filter((l) => /^#{1,6}\s+\S+/.test(l));
  const bullets = lines.filter((l) => /^[-*+]\s+\S+/.test(l) || /^\d+[.)]\s+\S+/.test(l));
  // At least two slide-worthy blocks: multiple headings, or heading+bullets, or many bullets.
  if (headings.length >= 2) return true;
  if (headings.length >= 1 && bullets.length >= 2) return true;
  if (bullets.length >= 4) return true;
  // Paragraph sections separated by blank lines
  const sections = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => stripMarkdownNoise(s).length >= 40);
  return sections.length >= 2;
}

function hasPdfBody(text: string): boolean {
  const body = stripMarkdownNoise(text);
  // Slightly stricter than bare min chars: PDF must carry real paragraphs.
  return body.length >= WORD_CONTENT_MIN_CHARS && body.split(/\s+/).length >= 12;
}

/**
 * Format-specific checks on top of the common gate (P2-02).
 */
export function validateFormatSpecificSourceContent(
  raw: string,
  format: DeliverableFormat,
): ContentQualityResult {
  const text = raw?.trim() ?? "";
  if (!text) {
    return {
      ok: false,
      issues: ["empty"],
      message: "文書内容が空です。",
    };
  }

  if (format === "xlsx" && !hasSpreadsheetStructure(text)) {
    return {
      ok: false,
      issues: ["xlsx_insufficient_structure"],
      message:
        "Excel成果物には表・箇条書き・数値など構造化された内容が必要です。入力内容は保存されています。再実行してください。",
    };
  }
  if (format === "pptx" && !hasSlideStructure(text)) {
    return {
      ok: false,
      issues: ["pptx_insufficient_structure"],
      message:
        "PowerPoint成果物には見出しや箇条書きなどスライド構成が必要です。入力内容は保存されています。再実行してください。",
    };
  }
  if (format === "pdf" && !hasPdfBody(text)) {
    return {
      ok: false,
      issues: ["pdf_insufficient_body"],
      message:
        "PDF成果物には十分な本文が必要です。入力内容は保存されています。再実行してください。",
    };
  }
  return { ok: true, text };
}

function uniqueIssues(issues: ContentQualityIssue[]): ContentQualityIssue[] {
  return [...new Set(issues)];
}

/**
 * Unified gate: common + each requested office format (P2-02).
 * md/txt alone still get the common gate.
 */
export function validateDeliverableSourceContent(
  raw: string,
  formats: readonly DeliverableFormat[],
): ContentQualityResult {
  const common = validateCommonSourceContent(raw);
  if (!common.ok) return common;

  const targets =
    formats.length === 0
      ? (["docx"] as DeliverableFormat[])
      : formats.filter(
          (f) =>
            OFFICE_FORMATS.includes(f) || f === "md" || f === "txt",
        );

  const issues: ContentQualityIssue[] = [];
  for (const format of targets) {
    if (format === "md" || format === "txt") continue;
    const specific = validateFormatSpecificSourceContent(common.text, format);
    if (!specific.ok) issues.push(...specific.issues);
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues: uniqueIssues(issues),
      message:
        "成果物変換の前に、文書内容の作成で問題が発生しました。入力内容は保存されています。再実行してください。",
    };
  }
  return { ok: true, text: common.text };
}

/**
 * Gate AI body quality BEFORE Word conversion starts.
 * Backward-compatible wrapper → unified common+docx path.
 */
export function validateWordSourceContent(raw: string): ContentQualityResult {
  return validateDeliverableSourceContent(raw, ["docx"]);
}

export type ContentRetryStrategy = "same_model" | "simplified_prompt" | "fallback_model";

export function contentRetryStrategyForAttempt(
  attempt: number,
): ContentRetryStrategy {
  if (attempt <= 1) return "same_model";
  if (attempt === 2) return "simplified_prompt";
  return "fallback_model";
}

export const WORD_CONTENT_RETRY_LIMIT = WORD_CONTENT_MAX_RETRIES;

async function generateQualityContentForFormats(input: {
  initialContent: string;
  formats: readonly DeliverableFormat[];
  regenerate?: (strategy: ContentRetryStrategy, attempt: number) => Promise<string>;
  maxAttempts?: number;
}): Promise<
  | { ok: true; text: string; attempts: number }
  | {
      ok: false;
      message: string;
      issues: ContentQualityIssue[];
      attempts: number;
      preservedInput: string;
    }
> {
  const maxAttempts = input.maxAttempts ?? WORD_CONTENT_MAX_RETRIES;
  let current = input.initialContent;
  let lastIssues: ContentQualityIssue[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const checked = validateDeliverableSourceContent(current, input.formats);
    if (checked.ok) {
      return { ok: true, text: checked.text, attempts: attempt };
    }
    lastIssues = checked.issues;
    if (attempt >= maxAttempts || !input.regenerate) {
      break;
    }
    const strategy = contentRetryStrategyForAttempt(attempt + 1);
    current = await input.regenerate(strategy, attempt + 1);
  }

  return {
    ok: false,
    message:
      "成果物変換の前に、文書内容の作成で問題が発生しました。入力内容は保存されています。再実行してください。",
    issues: lastIssues,
    attempts: maxAttempts,
    preservedInput: input.initialContent,
  };
}

/**
 * Retry AI content generation until quality passes for the requested formats.
 */
export async function generateQualityDeliverableContent(input: {
  initialContent: string;
  formats: readonly DeliverableFormat[];
  regenerate?: (strategy: ContentRetryStrategy, attempt: number) => Promise<string>;
  maxAttempts?: number;
}): Promise<
  | { ok: true; text: string; attempts: number }
  | {
      ok: false;
      message: string;
      issues: ContentQualityIssue[];
      attempts: number;
      preservedInput: string;
    }
> {
  return generateQualityContentForFormats(input);
}

/**
 * Word-path compatibility wrapper (formats fixed to docx).
 */
export async function generateQualityWordContent(input: {
  initialContent: string;
  regenerate?: (strategy: ContentRetryStrategy, attempt: number) => Promise<string>;
  maxAttempts?: number;
}): Promise<
  | { ok: true; text: string; attempts: number }
  | {
      ok: false;
      message: string;
      issues: ContentQualityIssue[];
      attempts: number;
      preservedInput: string;
    }
> {
  return generateQualityContentForFormats({
    ...input,
    formats: ["docx"],
  });
}
