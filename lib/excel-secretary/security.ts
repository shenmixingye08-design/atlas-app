/**
 * Excel/CSV security helpers — CSV injection, filename sanitize, leading-zero keys.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Neutralize CSV/Excel formula injection when exporting text cells. */
export function sanitizeCsvCell(value: string): string {
  const trimmed = value.replace(/^\uFEFF/, "");
  if (FORMULA_PREFIX.test(trimmed)) {
    return `'${trimmed}`;
  }
  if (/[",\n\r]/.test(trimmed)) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }
  return trimmed;
}

export function sanitizeExcelFileName(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "excel"
  );
}

/** Headers that must stay text (leading zeros). */
export function headerRequiresText(header: string): boolean {
  return /郵便|郵便番号|zip|電話|tel|phone|商品コード|顧客番号|会員番号|コード|code|isbn|口座/i.test(
    header,
  );
}

export function looksLikeZipBomb(input: {
  compressedBytes: number;
  uncompressedHint?: number;
}): boolean {
  if (input.compressedBytes > 15 * 1024 * 1024) return true;
  if (
    input.uncompressedHint != null &&
    input.compressedBytes > 0 &&
    input.uncompressedHint / input.compressedBytes > 100
  ) {
    return true;
  }
  return false;
}
