/**
 * Trusted Excel formulas emitted by MINERVOT — never from raw AI/OCR cell text.
 */

export function columnLetter(index0: number): string {
  let n = index0 + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

export function sumFormula(colIndex0: number, fromRow: number, toRow: number): string {
  const col = columnLetter(colIndex0);
  return `SUM(${col}${fromRow}:${col}${toRow})`;
}

export function averageFormula(
  colIndex0: number,
  fromRow: number,
  toRow: number,
): string {
  const col = columnLetter(colIndex0);
  return `AVERAGE(${col}${fromRow}:${col}${toRow})`;
}

export function countFormula(
  colIndex0: number,
  fromRow: number,
  toRow: number,
): string {
  const col = columnLetter(colIndex0);
  return `COUNTA(${col}${fromRow}:${col}${toRow})`;
}

export function sumIfFormula(input: {
  sourceSheet: string;
  criteriaCol0: number;
  criteriaCell: string;
  valueCol0: number;
}): string {
  const sheet = quoteSheetName(input.sourceSheet);
  const crit = columnLetter(input.criteriaCol0);
  const val = columnLetter(input.valueCol0);
  return `SUMIF(${sheet}!${crit}:${crit},${input.criteriaCell},${sheet}!${val}:${val})`;
}

export function sumIfsMonthFormula(input: {
  sourceSheet: string;
  dateCol0: number;
  valueCol0: number;
  year: number;
  month: number;
}): string {
  const sheet = quoteSheetName(input.sourceSheet);
  const dateCol = columnLetter(input.dateCol0);
  const valCol = columnLetter(input.valueCol0);
  const start = `DATE(${input.year},${input.month},1)`;
  const end = `DATE(${input.year},${input.month}+1,1)`;
  return `SUMIFS(${sheet}!${valCol}:${valCol},${sheet}!${dateCol}:${dateCol},">="&${start},${sheet}!${dateCol}:${dateCol},"<"&${end})`;
}

export function countIfFormula(input: {
  sourceSheet: string;
  criteriaCol0: number;
  criteriaCell: string;
}): string {
  const sheet = quoteSheetName(input.sourceSheet);
  const crit = columnLetter(input.criteriaCol0);
  return `COUNTIF(${sheet}!${crit}:${crit},${input.criteriaCell})`;
}
