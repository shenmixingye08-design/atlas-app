/**
 * P0-05: Neutralize spreadsheet formula / hyperlink injection.
 * Leading = + - @ \t \r can turn user/OCR text into executable formulas
 * (=HYPERLINK, =WEBSERVICE, DDE, etc.) when opened in Excel.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeSpreadsheetCell(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value);
  if (!text) return "";
  if (FORMULA_PREFIX.test(text)) {
    return `'${text}`;
  }
  return text;
}

export function neutralizeSpreadsheetRow(
  cells: unknown[],
): Array<string | number | boolean | null> {
  return cells.map((cell) => neutralizeSpreadsheetCell(cell));
}
