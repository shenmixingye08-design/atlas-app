/**
 * Typed cell coercion for production Excel output.
 * Never force all values to strings.
 */

export type ExcelCellKind =
  | "text"
  | "number"
  | "integer"
  | "decimal"
  | "date"
  | "time"
  | "datetime"
  | "currency"
  | "percent"
  | "boolean"
  | "error";

export type CoercedCell = {
  kind: ExcelCellKind;
  /** ExcelJS cell value (number | string | boolean | Date | {error}) */
  value: string | number | boolean | Date | { error: string };
  numFmt?: string;
  align?: "left" | "center" | "right";
};

const CURRENCY_HEADER =
  /金額|単価|税|売上|支出|収入|価格|料金|請求|支払|budget|amount|price|cost|fee|円/i;
const PERCENT_HEADER = /率|割合|構成比|%|percent|ratio|share/i;
const DATE_HEADER = /日付|年月日|納期|期限|date|day/i;
const TIME_HEADER = /時刻|時間帯|^時間$|time/i;
const DATETIME_HEADER = /日時|timestamp|datetime/i;
const INT_HEADER = /数量|個数|件数|人数|在庫|qty|count|rank|順位/i;
const BOOL_HEADER = /フラグ|有無|可否|true|false|boolean|完了/i;

export function inferHeaderKind(header: string): ExcelCellKind {
  const h = header.trim();
  if (!h) return "text";
  if (DATETIME_HEADER.test(h)) return "datetime";
  if (DATE_HEADER.test(h) && !TIME_HEADER.test(h)) return "date";
  if (TIME_HEADER.test(h) && !DATE_HEADER.test(h)) return "time";
  if (PERCENT_HEADER.test(h)) return "percent";
  if (CURRENCY_HEADER.test(h)) return "currency";
  if (BOOL_HEADER.test(h)) return "boolean";
  if (INT_HEADER.test(h)) return "integer";
  return "text";
}

function parseNumber(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/[,，\s]/g, "")
    .replace(/[¥￥円]/g, "")
    .replace(/%$/, "");
  if (!cleaned || cleaned === "-" || cleaned === "—") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/\./g, "/")
    .replace(/年/g, "/")
    .replace(/月/g, "/")
    .replace(/日/g, "")
    .replace(/\s+/g, " ");
  const t = Date.parse(normalized);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

function parseTime(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const d = new Date(1899, 11, 30, Number(m[1]), Number(m[2]), Number(m[3] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBoolean(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (["true", "yes", "y", "1", "有", "はい", "完了", "○", "ok"].includes(t)) {
    return true;
  }
  if (["false", "no", "n", "0", "無", "いいえ", "未完了", "×", "ng"].includes(t)) {
    return false;
  }
  return null;
}

/**
 * Coerce a string cell into a typed Excel value based on column kind + content.
 */
export function coerceTypedCell(
  raw: string,
  kindHint: ExcelCellKind,
): CoercedCell {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: "text", value: "", align: "left" };
  }

  if (/^#(REF!|VALUE!|NAME\?|N\/A|DIV\/0!|NULL!|NUM!)/i.test(trimmed)) {
    return {
      kind: "error",
      value: { error: trimmed.replace(/^#/, "#").toUpperCase() },
      align: "center",
    };
  }

  let kind = kindHint;
  if (kind === "text") {
    if (parseBoolean(trimmed) != null && /^(true|false|有|無|はい|いいえ)$/i.test(trimmed)) {
      kind = "boolean";
    } else if (/%$/.test(trimmed) && parseNumber(trimmed) != null) {
      kind = "percent";
    } else if (
      /[¥￥円]/.test(trimmed) ||
      (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed) && parseNumber(trimmed) != null)
    ) {
      kind = "currency";
    } else if (/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(trimmed)) {
      kind = trimmed.includes(":") ? "datetime" : "date";
    } else if (/^\d{1,2}:\d{2}/.test(trimmed)) {
      kind = "time";
    } else if (parseNumber(trimmed) != null && /^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, ""))) {
      kind = trimmed.includes(".") ? "decimal" : "integer";
    }
  }

  switch (kind) {
    case "boolean": {
      const b = parseBoolean(trimmed);
      if (b == null) return { kind: "text", value: trimmed, align: "left" };
      return { kind: "boolean", value: b, align: "center" };
    }
    case "percent": {
      const n = parseNumber(trimmed);
      if (n == null) return { kind: "text", value: trimmed, align: "left" };
      const ratio = /%$/.test(trimmed) || Math.abs(n) > 1 ? n / 100 : n;
      return {
        kind: "percent",
        value: ratio,
        numFmt: "0.0%",
        align: "right",
      };
    }
    case "currency": {
      const n = parseNumber(trimmed);
      if (n == null) return { kind: "text", value: trimmed, align: "left" };
      return {
        kind: "currency",
        value: n,
        numFmt: '¥#,##0',
        align: "right",
      };
    }
    case "integer": {
      const n = parseNumber(trimmed);
      if (n == null) return { kind: "text", value: trimmed, align: "left" };
      return {
        kind: "integer",
        value: Math.trunc(n),
        numFmt: "#,##0",
        align: "right",
      };
    }
    case "decimal":
    case "number": {
      const n = parseNumber(trimmed);
      if (n == null) return { kind: "text", value: trimmed, align: "left" };
      return {
        kind: kind === "decimal" ? "decimal" : "number",
        value: n,
        numFmt: n % 1 === 0 ? "#,##0" : "#,##0.##",
        align: "right",
      };
    }
    case "date": {
      const d = parseDate(trimmed);
      if (!d) return { kind: "text", value: trimmed, align: "left" };
      return { kind: "date", value: d, numFmt: "yyyy-mm-dd", align: "center" };
    }
    case "time": {
      const d = parseTime(trimmed) ?? parseDate(trimmed);
      if (!d) return { kind: "text", value: trimmed, align: "left" };
      return { kind: "time", value: d, numFmt: "hh:mm", align: "center" };
    }
    case "datetime": {
      const d = parseDate(trimmed);
      if (!d) return { kind: "text", value: trimmed, align: "left" };
      return {
        kind: "datetime",
        value: d,
        numFmt: "yyyy-mm-dd hh:mm",
        align: "center",
      };
    }
    case "error":
      return {
        kind: "error",
        value: { error: trimmed.startsWith("#") ? trimmed : `#${trimmed}` },
        align: "center",
      };
    default:
      return { kind: "text", value: trimmed, align: "left" };
  }
}

export function inferColumnKinds(
  headers: string[],
  rows: string[][],
): ExcelCellKind[] {
  return headers.map((header, col) => {
    const hint = inferHeaderKind(header);
    if (hint !== "text") return hint;
    const samples = rows
      .map((row) => row[col] ?? "")
      .filter((v) => v.trim().length > 0)
      .slice(0, 12);
    if (samples.length === 0) return "text";
    const kinds = samples.map((s) => coerceTypedCell(s, "text").kind);
    const numeric = kinds.filter((k) =>
      ["number", "integer", "decimal", "currency", "percent"].includes(k),
    );
    if (numeric.length >= Math.ceil(samples.length * 0.7)) {
      if (numeric.every((k) => k === "currency")) return "currency";
      if (numeric.every((k) => k === "percent")) return "percent";
      if (numeric.every((k) => k === "integer")) return "integer";
      return "number";
    }
    const dates = kinds.filter((k) => k === "date" || k === "datetime");
    if (dates.length >= Math.ceil(samples.length * 0.7)) return "date";
    return "text";
  });
}

export function colLetter(index1Based: number): string {
  let n = index1Based;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
