/**
 * Detect explicit Word (.docx) output requests from assignment text.
 * Must NOT treat WordPress / キーワード alone as Word intent.
 */

const FULLWIDTH_ASCII = /[Ａ-Ｚａ-ｚ０-９．]/g;

function toHalfWidthAscii(value: string): string {
  return value.replace(FULLWIDTH_ASCII, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

/** Normalize for keyword matching: NFKC, lower, unify punctuation/spaces. */
export function normalizeAssignmentForFormatDetection(value: string): string {
  return toHalfWidthAscii(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[！!？?。．、，,：:；;]/g, " ")
    .replace(/[\u3000\s]+/g, " ")
    .trim();
}

/**
 * Strip known false-positive tokens before matching「ワード」/ word.
 * 「キーワード」contains「ワード」; WordPress contains「word」.
 */
function stripFalsePositiveWordTokens(normalized: string): string {
  return normalized
    .replace(/wordpress/g, " ")
    .replace(/キーワード/g, " ")
    .replace(/keyword/g, " ");
}

const EXPLICIT_WORD_PATTERNS: readonly RegExp[] = [
  /\.docx\b/,
  /\bdocx\b/,
  /microsoft\s*word/,
  /ワード\s*ファイル/,
  /ワード\s*形式/,
  /ワード\s*で/,
  /ワード\s*に\s*まとめ/,
  /ワード\s*にして/,
  /ワード\s*で\s*作/,
  /ワード\s*で\s*出力/,
  /ワード\s*で\s*ください/,
  /word\s*ファイル/,
  /word\s*形式/,
  /word\s*で/,
  /word\s*に\s*まとめ/,
  /word\s*にして/,
  /word\s*で\s*作/,
  /word\s*で\s*出力/,
  /\bword\b/,
  /ワード/,
];

/** True when the user clearly asked for a Word / .docx file. */
export function isExplicitWordRequest(assignment: string): boolean {
  const normalized = normalizeAssignmentForFormatDetection(assignment);
  if (!normalized) return false;
  const haystack = stripFalsePositiveWordTokens(normalized);
  return EXPLICIT_WORD_PATTERNS.some((pattern) => pattern.test(haystack));
}
