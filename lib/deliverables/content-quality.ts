import {
  WORD_CONTENT_MAX_RETRIES,
  WORD_CONTENT_MIN_CHARS,
} from "./constants";

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
  | "no_body_language";

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

  // Same 20+ char chunk repeated many times
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

  // Same line repeated
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
  // Ends mid-sentence without terminal punctuation and without a closing fence
  const last = trimmed.slice(-1);
  if (!/[。．.！？!?\n」』）)\]]$/.test(last) && trimmed.length < 400) {
    // Short incomplete drafts often end with a dangling clause particle
    if (/[はがをにでと]$/.test(trimmed)) return true;
  }
  // Unclosed code fence
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
  const bodyLines = lines.filter((l) => !/^#{1,6}\s+/.test(l) && !/^[-*_]{3,}$/.test(l));
  const body = stripMarkdownNoise(bodyLines.join("\n"));
  return body.length < WORD_CONTENT_MIN_CHARS;
}

function hasRequiredLanguage(text: string): boolean {
  // Japanese kana/kanji OR substantial Latin letters (requested language proxy)
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= WORD_CONTENT_MIN_CHARS;
}

/**
 * Gate AI body quality BEFORE Word conversion starts.
 * Failures must trigger AI content retry — not a broken docx.
 */
export function validateWordSourceContent(raw: string): ContentQualityResult {
  const text = raw?.trim() ?? "";
  const issues: ContentQualityIssue[] = [];

  if (!text) {
    return {
      ok: false,
      issues: ["empty"],
      message: "文書内容が空です。",
    };
  }

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

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      message:
        "Word変換の前に、文書内容の作成で問題が発生しました。入力内容は保存されています。再実行してください。",
    };
  }

  return { ok: true, text };
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

/**
 * Retry AI content generation until quality passes or attempts exhausted.
 * `regenerate` is provided by the caller (orchestration / test harness).
 */
export async function generateQualityWordContent(input: {
  initialContent: string;
  regenerate?: (strategy: ContentRetryStrategy, attempt: number) => Promise<string>;
  maxAttempts?: number;
}): Promise<
  | { ok: true; text: string; attempts: number }
  | { ok: false; message: string; issues: ContentQualityIssue[]; attempts: number; preservedInput: string }
> {
  const maxAttempts = input.maxAttempts ?? WORD_CONTENT_MAX_RETRIES;
  let current = input.initialContent;
  let lastIssues: ContentQualityIssue[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const checked = validateWordSourceContent(current);
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
      "Word変換の前に、文書内容の作成で問題が発生しました。入力内容は保存されています。再実行してください。",
    issues: lastIssues,
    attempts: maxAttempts,
    preservedInput: input.initialContent,
  };
}
