/**
 * OCR 構造化フィールド抽出（ルールベース）。
 * Vision LLM の extractedText / fields を補強し、税込・税抜・消費税・連絡先などを揃える。
 */

import type { VisionFieldMap } from "@/lib/vision/types";

export type StructuredOcrFields = {
  companyName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  date: string | null;
  amountTaxIncluded: number | null;
  amountTaxExcluded: number | null;
  taxAmount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
  currency: string | null;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:0\d{1,4}[-(]?\d{1,4}[-)]?\d{3,4}|\+?\d{1,3}[- ]?\d{1,4}[- ]?\d{3,4})/;
const DATE_RE =
  /(?:20\d{2}|令和\d{1,2}|平成\d{1,2})[年/\-.]\s*\d{1,2}[月/\-.]\s*\d{1,2}日?|\d{1,2}\/\d{1,2}\/\d{2,4}/;
const AMOUNT_NUM = "([\\d,]+(?:\\.\\d{1,2})?)";

function asFieldString(fields: VisionFieldMap, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.replace(/,/g, "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function findLabeledAmount(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    // ラベルと金額の間に「合計」等の語が挟まる帳票表記にも対応
    const re = new RegExp(
      `${label.source}[^\\d¥￥]{0,12}[¥￥]?\\s*${AMOUNT_NUM}`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1]) {
      const v = parseAmount(m[1]);
      if (v != null && v > 0) return v;
    }
  }
  return null;
}

function findCompany(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (
      /(株式会社|有限会社|合同会社|Inc\.|Ltd\.|Corp\.|Co\.)/i.test(line) &&
      line.length <= 80
    ) {
      return line;
    }
  }
  return null;
}

function findAddress(text: string): string | null {
  const m = text.match(
    /(?:〒?\d{3}-?\d{4}\s*)?(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)[^\n]{4,60}/,
  );
  return m?.[0]?.trim() ?? null;
}

/**
 * OCR テキストと既存 fields から構造化フィールドを合成する。
 */
export function extractStructuredOcrFields(
  extractedText: string | null | undefined,
  fields: VisionFieldMap,
): StructuredOcrFields {
  const text = (extractedText ?? "") || Object.values(fields).map(String).join("\n");

  const email =
    asFieldString(fields, "email", "mail", "メール") ||
    text.match(EMAIL_RE)?.[0] ||
    null;
  const phone =
    asFieldString(fields, "phone", "tel", "telephone", "電話") ||
    text.match(PHONE_RE)?.[0] ||
    null;
  const date =
    asFieldString(fields, "date", "issueDate", "purchaseDate", "日付") ||
    text.match(DATE_RE)?.[0] ||
    null;

  const amountTaxIncluded =
    findLabeledAmount(text, [/税込/, /合計（税込）/, /total\s*incl/i]) ??
    parseAmount(asFieldString(fields, "amount", "total", "合計") || "") ??
    findLabeledAmount(text, [/合計/, /total/i]);

  const amountTaxExcluded =
    findLabeledAmount(text, [/税抜/, /本体価格/, /subtotal/i]) ??
    parseAmount(asFieldString(fields, "subtotal", "taxExcluded", "税抜") || "");

  const taxAmount =
    findLabeledAmount(text, [/消費税/, /税額/, /(?:^|\s)tax(?!\s*incl)/i]) ??
    parseAmount(asFieldString(fields, "tax", "消費税") || "");

  const quantity =
    parseAmount(asFieldString(fields, "quantity", "qty", "数量") || "") ??
    (() => {
      const m = text.match(/(?:数量|qty|quantity)\s*[:：]?\s*([\d,]+)/i);
      return m?.[1] ? parseAmount(m[1]) : null;
    })();

  const unitPrice =
    parseAmount(asFieldString(fields, "unitPrice", "unit_price", "単価") || "") ??
    findLabeledAmount(text, [/単価/, /unit\s*price/i]);

  const total =
    amountTaxIncluded ??
    parseAmount(asFieldString(fields, "total", "合計") || "") ??
    findLabeledAmount(text, [/合計/, /grand\s*total/i]);

  const companyName =
    asFieldString(fields, "companyName", "company", "issuer", "会社名", "storeName") ||
    findCompany(text);

  const address =
    asFieldString(fields, "address", "住所") || findAddress(text);

  const currency =
    asFieldString(fields, "currency") ||
    (/[¥￥]|円|JPY/i.test(text) ? "JPY" : /\$|USD/i.test(text) ? "USD" : null);

  return {
    companyName: companyName || null,
    address: address || null,
    phone: phone || null,
    email: email || null,
    date: date || null,
    amountTaxIncluded: amountTaxIncluded ?? null,
    amountTaxExcluded: amountTaxExcluded ?? null,
    taxAmount: taxAmount ?? null,
    quantity: quantity ?? null,
    unitPrice: unitPrice ?? null,
    total: total ?? null,
    currency,
  };
}

/**
 * 構造化結果を fields にマージ（既存キーは上書きしない）。
 */
export function mergeStructuredFields(
  fields: VisionFieldMap,
  structured: StructuredOcrFields,
): VisionFieldMap {
  const next: VisionFieldMap = { ...fields };

  const put = (key: string, value: string | number | null) => {
    if (value == null || value === "") return;
    if (next[key] != null && next[key] !== "") return;
    next[key] = value;
  };

  put("companyName", structured.companyName);
  put("address", structured.address);
  put("phone", structured.phone);
  put("email", structured.email);
  put("date", structured.date);
  put("amountTaxIncluded", structured.amountTaxIncluded);
  put("amountTaxExcluded", structured.amountTaxExcluded);
  put("tax", structured.taxAmount);
  put("quantity", structured.quantity);
  put("unitPrice", structured.unitPrice);
  put("total", structured.total);
  put("currency", structured.currency);

  // 互換エイリアス（既存アダプタが参照）
  if (next.total == null && structured.total != null) next.total = structured.total;
  if (next.subtotal == null && structured.amountTaxExcluded != null) {
    next.subtotal = structured.amountTaxExcluded;
  }

  return next;
}

/**
 * OCR 精度の簡易スコア（0–1）。必須フィールド充足と文字化けで推定。
 */
export function estimateOcrAccuracy(
  extractedText: string | null | undefined,
  fields: VisionFieldMap,
  requiredKeys: string[],
): number {
  const text = extractedText?.trim() ?? "";
  const fieldEntries = Object.entries(fields).filter(
    ([, v]) => v != null && String(v).trim() !== "",
  );
  if (!text && fieldEntries.length === 0) return 0;

  const garbled =
    (text.match(/[�□]|ï¿½/g)?.length ?? 0) / Math.max(1, text.length);

  const present = requiredKeys.filter((k) => {
    const aliases: Record<string, string[]> = {
      total: ["total", "amount", "amountTaxIncluded", "合計"],
      companyName: ["companyName", "company", "issuer", "会社名", "storeName"],
      name: ["name", "personName", "fullName", "氏名"],
      date: ["date", "issueDate", "purchaseDate", "日付"],
    };
    const keys = aliases[k] ?? [k];
    return keys.some((key) => {
      const v = fields[key];
      return v != null && String(v).trim() !== "" && String(v) !== "要確認";
    });
  }).length;
  const coverage =
    requiredKeys.length === 0 ? 1 : present / requiredKeys.length;

  const textScore = Math.min(1, text.length / 80);
  const fieldScore = Math.min(1, fieldEntries.length / 4);
  const score =
    fieldScore * 0.35 + coverage * 0.4 + textScore * 0.25 - garbled * 2;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}
