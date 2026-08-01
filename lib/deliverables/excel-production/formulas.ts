import { colLetter } from "./cell-types";

export const REQUIRED_FORMULA_NAMES = [
  "SUM",
  "AVERAGE",
  "COUNT",
  "COUNTA",
  "IF",
  "IFS",
  "ROUND",
  "ROUNDUP",
  "ROUNDDOWN",
  "VLOOKUP",
  "XLOOKUP",
  "INDEX",
  "MATCH",
  "SUMIF",
  "COUNTIF",
  "TEXT",
  "LEFT",
  "RIGHT",
  "MID",
  "TODAY",
  "NOW",
  "NETWORKDAYS",
] as const;

export type RequiredFormulaName = (typeof REQUIRED_FORMULA_NAMES)[number];

/**
 * Build a formula verification sheet that references a data sheet.
 * All formulas use valid ranges so Excel does not emit #REF! / #NAME? at open.
 */
export function buildFormulaCatalogRows(input: {
  dataSheetName: string;
  /** 1-based column index of a numeric amount column */
  amountCol: number;
  /** 1-based column index of a text key column */
  keyCol: number;
  /** data rows (excluding header) */
  dataRowCount: number;
}): Array<{ label: string; formula: string; name: RequiredFormulaName }> {
  const sheet = input.dataSheetName.replace(/'/g, "''");
  const quoted = `'${sheet}'`;
  const amount = colLetter(input.amountCol);
  const key = colLetter(input.keyCol);
  const last = Math.max(input.dataRowCount + 1, 2);
  const amountRange = `${quoted}!$${amount}$2:$${amount}$${last}`;
  const keyRange = `${quoted}!$${key}$2:$${key}$${last}`;
  const tableRange = `${quoted}!$${key}$2:$${amount}$${last}`;
  const firstKey = `${quoted}!$${key}$2`;
  const firstAmount = `${quoted}!$${amount}$2`;

  return [
    { name: "SUM", label: "SUM", formula: `SUM(${amountRange})` },
    { name: "AVERAGE", label: "AVERAGE", formula: `AVERAGE(${amountRange})` },
    { name: "COUNT", label: "COUNT", formula: `COUNT(${amountRange})` },
    { name: "COUNTA", label: "COUNTA", formula: `COUNTA(${keyRange})` },
    {
      name: "IF",
      label: "IF",
      formula: `IF(${firstAmount}>0,"OK","NG")`,
    },
    {
      name: "IFS",
      label: "IFS",
      formula: `IFS(${firstAmount}>=1000,"高",${firstAmount}>=0,"低")`,
    },
    {
      name: "ROUND",
      label: "ROUND",
      formula: `ROUND(AVERAGE(${amountRange}),0)`,
    },
    {
      name: "ROUNDUP",
      label: "ROUNDUP",
      formula: `ROUNDUP(AVERAGE(${amountRange}),0)`,
    },
    {
      name: "ROUNDDOWN",
      label: "ROUNDDOWN",
      formula: `ROUNDDOWN(AVERAGE(${amountRange}),0)`,
    },
    {
      name: "VLOOKUP",
      label: "VLOOKUP",
      formula: `VLOOKUP(${firstKey},${tableRange},${Math.max(1, input.amountCol - input.keyCol + 1)},FALSE)`,
    },
    {
      name: "XLOOKUP",
      label: "XLOOKUP",
      formula: `XLOOKUP(${firstKey},${keyRange},${amountRange},"なし")`,
    },
    {
      name: "INDEX",
      label: "INDEX",
      formula: `INDEX(${amountRange},1)`,
    },
    {
      name: "MATCH",
      label: "MATCH",
      formula: `MATCH(${firstKey},${keyRange},0)`,
    },
    {
      name: "SUMIF",
      label: "SUMIF",
      formula: `SUMIF(${keyRange},${firstKey},${amountRange})`,
    },
    {
      name: "COUNTIF",
      label: "COUNTIF",
      formula: `COUNTIF(${keyRange},${firstKey})`,
    },
    {
      name: "TEXT",
      label: "TEXT",
      formula: `TEXT(${firstAmount},"#,##0")`,
    },
    {
      name: "LEFT",
      label: "LEFT",
      formula: `LEFT(${firstKey},2)`,
    },
    {
      name: "RIGHT",
      label: "RIGHT",
      formula: `RIGHT(${firstKey},2)`,
    },
    {
      name: "MID",
      label: "MID",
      formula: `MID(${firstKey},1,2)`,
    },
    { name: "TODAY", label: "TODAY", formula: "TODAY()" },
    { name: "NOW", label: "NOW", formula: "NOW()" },
    {
      name: "NETWORKDAYS",
      label: "NETWORKDAYS",
      formula: "NETWORKDAYS(TODAY(),TODAY()+5)",
    },
  ];
}

const FORMULA_ERROR_MARKERS = [
  "#REF!",
  "#VALUE!",
  "#NAME?",
  "#N/A",
  "#DIV/0!",
  "#NULL!",
  "#NUM!",
] as const;

export function formulaLooksBroken(formula: string): boolean {
  const upper = formula.toUpperCase();
  if (!formula.trim()) return true;
  for (const marker of FORMULA_ERROR_MARKERS) {
    if (upper.includes(marker)) return true;
  }
  // empty refs like Sheet!$A$2:$A$1 inverted are ok; bare # is not
  if (/#$/.test(formula)) return true;
  return false;
}
