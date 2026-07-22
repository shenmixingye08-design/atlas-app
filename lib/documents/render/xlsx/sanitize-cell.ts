/** Guard against Excel formula injection (=, +, -, @). */
export function sanitizeExcelCell(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
}

export function sanitizeExcelRow(row: string[]): string[] {
  return row.map(sanitizeExcelCell);
}
