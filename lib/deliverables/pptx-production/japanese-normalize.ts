/**
 * Business Japanese normalization for PowerPoint body text (non-AI).
 */

export function normalizeJapaneseBusinessText(input: string): string {
  if (!input) return input;

  let text = input.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  text = text.replace(/[\uff01-\uff5e]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  text = text.replace(/\u3000/g, " ");

  text = text
    .replace(/\s+([、。．，！？])/g, "$1")
    .replace(/([、。．，！？])\s+/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[−‒–—―]/g, "ー");

  return text;
}

/** Fit slide text length for readability (auto-shrink hint). */
export function fitFontSize(
  text: string,
  base: number,
  min = 12,
  maxChars = 420,
): number {
  if (text.length <= maxChars) return base;
  const ratio = maxChars / text.length;
  return Math.max(min, Math.round(base * Math.min(1, ratio + 0.35)));
}
