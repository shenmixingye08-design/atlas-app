/**
 * Business Japanese normalization for PDF body text (non-AI).
 * Does not invent content — only normalizes punctuation / width forms.
 */

const ZENKAKU_ASCII =
  /[！-～]/g; // fullwidth ASCII range start; refined below

export function normalizeJapaneseBusinessText(input: string): string {
  if (!input) return input;

  let text = input.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  // Fullwidth ASCII / digits → halfwidth
  text = text.replace(/[\uff01-\uff5e]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  text = text.replace(/\u3000/g, " ");

  // Tighten spaces around Japanese punctuation
  text = text
    .replace(/\s+([、。．，！？])/g, "$1")
    .replace(/([、。．，！？])\s+/g, "$1")
    .replace(/[ \t]{2,}/g, " ");

  // Normalize common dash variants used in business docs
  text = text.replace(/[−‒–—―]/g, "ー");

  void ZENKAKU_ASCII;
  return text;
}

/** Characters that should not start a line (kinsoku). */
const NO_START =
  /^[、。，．,.!?！？)）\]｝」』】〉》‰℃ゝゞーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎ]/u;

/** Characters that should not end a line (kinsoku). */
const NO_END = /[（(\[｛「『【〈《]$/u;

export function canBreakAfter(left: string, right: string): boolean {
  if (!left || !right) return true;
  if (NO_END.test(left)) return false;
  if (NO_START.test(right)) return false;
  return true;
}
