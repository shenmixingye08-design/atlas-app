/**
 * Business Japanese normalization for Word body text.
 * Does not invent content — only normalizes punctuation / width / spacing.
 */

const FULLWIDTH_ASCII_START = 0xff01;
const FULLWIDTH_ASCII_END = 0xff5e;
const ASCII_OFFSET = 0xfee0;

/** Convert full-width ASCII letters/digits to half-width (keep Japanese full-width punctuation). */
export function normalizeAlphanumericWidth(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= FULLWIDTH_ASCII_START && code <= FULLWIDTH_ASCII_END) {
      // Keep full-width punctuation commonly used in Japanese prose.
      if (
        ch === "！" ||
        ch === "？" ||
        ch === "（" ||
        ch === "）" ||
        ch === "［" ||
        ch === "］" ||
        ch === "：" ||
        ch === "；" ||
        ch === "＇" ||
        ch === "＂"
      ) {
        out += ch;
        continue;
      }
      out += String.fromCodePoint(code - ASCII_OFFSET);
      continue;
    }
    out += ch;
  }
  return out;
}

/** Unify common punctuation and collapse awkward spaces around CJK. */
export function normalizeJapaneseBusinessText(input: string): string {
  return normalizeAlphanumericWidth(input)
    .replace(/\u3000/g, " ") // ideographic space → normal space in mixed runs
    .replace(/[｡]/g, "。")
    .replace(/[､]/g, "、")
    .replace(/･/g, "・")
    .replace(/〜/g, "～")
    .replace(/--+/g, "—")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([、。．，！？])/g, "$1")
    .replace(/([、。．，！？]) +/g, "$1")
    .replace(/([「『（]) /g, "$1")
    .replace(/ ([」』）])/g, "$1")
    .trim();
}

export function normalizeJapaneseLines(lines: readonly string[]): string[] {
  return lines.map((line) => normalizeJapaneseBusinessText(line));
}
