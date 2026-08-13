/**
 * Excel column types for MINERVOT workbooks.
 * Currency/date/percent must be real typed cells — never "¥1,000" as text.
 */

export type ExcelColumnKind =
  | "currency"
  | "number"
  | "percentage"
  | "date"
  | "time"
  | "text";

export const REVIEW_PLACEHOLDER = "要確認";

export function isReviewPlaceholder(value: string): boolean {
  const t = value.trim();
  return (
    t === REVIEW_PLACEHOLDER ||
    t === "（不明）" ||
    t === "(不明)" ||
    t === "不明"
  );
}

export function headerSuggestsCurrency(header: string): boolean {
  return /金額|価格|売上|単価|料金|費用|支出|税込|税抜|amount|price|cost|revenue|円|currency|合計|総額/i.test(
    header,
  );
}

export function headerSuggestsDate(header: string): boolean {
  return /日付|日時|年月日|date|day|計上日|発行日/i.test(header);
}

export function headerSuggestsTime(header: string): boolean {
  return /時刻|時間帯|^時間$|time(?!out)/i.test(header);
}

export function headerSuggestsPercent(header: string): boolean {
  return /率|割合|構成比|percent|share|％|%/i.test(header);
}

export function headerSuggestsNumber(header: string): boolean {
  return /数量|個数|件数|qty|quantity|count|人数|回数/i.test(header);
}

export function headerSuggestsIdentifier(header: string): boolean {
  return /電話|TEL|郵便|〒|メール|email|ID\b|社員番号|顧客番号|郵便番号/i.test(
    header,
  );
}

export function looksNumeric(value: string): boolean {
  const cleaned = value.replace(/[,，\s¥￥円$€]/g, "");
  return /^-?\d+(\.\d+)?%?$/.test(cleaned);
}

export function looksPercent(value: string): boolean {
  return /^-?[\d,.，]+\s*%$/.test(value.trim()) || /％$/.test(value.trim());
}

export function looksDate(value: string): boolean {
  return (
    /^\d{4}[/-年]\d{1,2}[/-月]\d{1,2}/.test(value.trim()) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim())
  );
}

export function looksTime(value: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim());
}

export function looksCurrency(value: string): boolean {
  return /[円¥￥$€]/.test(value) || /^-?[\d,，]+(\.\d+)?円$/.test(value.trim());
}

export function inferColumnKind(
  header: string,
  samples: string[],
): ExcelColumnKind {
  const nonempty = samples.filter((s) => s.trim() && !isReviewPlaceholder(s));
  if (headerSuggestsIdentifier(header)) return "text";
  if (headerSuggestsPercent(header) || nonempty.some(looksPercent)) {
    return "percentage";
  }
  if (headerSuggestsCurrency(header) || nonempty.some(looksCurrency)) {
    if (
      headerSuggestsCurrency(header) ||
      nonempty.some(looksCurrency) ||
      nonempty.every((s) => looksNumeric(s) || looksCurrency(s))
    ) {
      return "currency";
    }
  }
  if (headerSuggestsDate(header) || nonempty.every((s) => looksDate(s))) {
    if (headerSuggestsDate(header) || nonempty.some(looksDate)) return "date";
  }
  if (headerSuggestsTime(header) || nonempty.every((s) => looksTime(s))) {
    if (headerSuggestsTime(header) || nonempty.some(looksTime)) return "time";
  }
  if (headerSuggestsNumber(header) && nonempty.some(looksNumeric)) {
    return "number";
  }
  if (
    nonempty.length > 0 &&
    nonempty.every((s) => looksNumeric(s)) &&
    !headerSuggestsIdentifier(header)
  ) {
    return "number";
  }
  return "text";
}

export function parseNumber(raw: string): number | null {
  if (isReviewPlaceholder(raw)) return null;
  const cleaned = raw.replace(/[,，\s¥￥円$€]/g, "").replace(/[%％]$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parsePercentage(raw: string): number | null {
  if (isReviewPlaceholder(raw)) return null;
  const trimmed = raw.trim();
  const hadSuffix = /[%％]$/.test(trimmed);
  const num = parseNumber(trimmed);
  if (num == null) return null;
  if (hadSuffix) return num / 100;
  if (num > 1 && num <= 100) return num / 100;
  return num;
}

export function parseDate(raw: string): Date | null {
  if (isReviewPlaceholder(raw)) return null;
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) {
    const dt = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const ja = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})/);
  if (ja) {
    const dt = new Date(
      Date.UTC(Number(ja[1]), Number(ja[2]) - 1, Number(ja[3])),
    );
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export function parseTime(raw: string): number | null {
  if (isReviewPlaceholder(raw)) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? 0);
  if (h > 23 || min > 59 || s > 59) return null;
  return (h + min / 60 + s / 3600) / 24;
}

export function currencyNumFmt(currency: string | null | undefined): string {
  const code = (currency ?? "JPY").trim().toUpperCase();
  if (code === "USD" || code === "$") return '"$"#,##0.00';
  if (code === "EUR" || code === "€") return '"€"#,##0.00';
  return '"¥"#,##0';
}

export function dateNumFmt(dateFormat: string | null | undefined): string {
  const raw = (dateFormat ?? "yyyy-mm-dd").trim().toLowerCase();
  if (raw.includes("yyyy/m/d") || raw === "ja-slash") return "yyyy/m/d";
  if (raw.includes("yyyy年")) return "yyyy年m月d日";
  return "yyyy-mm-dd";
}

export const PERCENT_NUM_FMT = "0.0%";
export const TIME_NUM_FMT = "h:mm";
export const NUMBER_NUM_FMT = "#,##0";
