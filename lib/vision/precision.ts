/**
 * Vision 精度サニタイザ（通常プログラム。追加 LLM なし）。
 *
 * 原則: 読めない値を推測して埋めない。誤った確定値より未確定（null + warning）を優先する。
 * OpenAI / mock どちらの解析結果も、parse 後に必ずここを通す。
 */

import type {
  VisionAnalysisResult,
  VisionCellKind,
  VisionFieldConfidence,
  VisionFieldMap,
  VisionTable,
} from "@/lib/vision/types";
import type { VisionAnalysisParsed } from "@/lib/vision/schemas";
import { visionModelPayloadSchema } from "@/lib/vision/schemas";

type VisionModelPayload = ReturnType<typeof visionModelPayloadSchema.parse>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

function compactDigits(value: string): string {
  return normalizeDigits(value).replace(/[^\d]/g, "");
}

function groundingText(extractedText: string | null | undefined): string {
  return extractedText ?? "";
}

function textContainsNumber(text: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const haystack = normalizeDigits(text);
  const abs = Math.abs(value);
  const candidates = [
    String(value),
    String(abs),
    abs.toLocaleString("en-US"),
    abs.toLocaleString("ja-JP"),
  ];
  if (!Number.isInteger(abs)) {
    candidates.push(abs.toFixed(2), abs.toFixed(1));
  }
  for (const candidate of candidates) {
    if (candidate && haystack.includes(candidate)) return true;
  }
  const digits = compactDigits(String(abs));
  if (digits.length < 1) return false;
  return compactDigits(haystack).includes(digits);
}

function textContainsDate(text: string, value: string): boolean {
  const digits = compactDigits(value);
  if (digits.length < 6) {
    return normalizeDigits(text).toLowerCase().includes(normalizeDigits(value).toLowerCase());
  }
  return compactDigits(text).includes(digits);
}

function textContainsToken(text: string, token: string): boolean {
  const needle = token.trim();
  if (!needle) return false;
  const haystack = normalizeDigits(text).toLowerCase();
  const normalized = normalizeDigits(needle).toLowerCase();
  if (haystack.includes(normalized)) return true;
  const compact = compactDigits(needle);
  return compact.length >= 8 && compactDigits(haystack).includes(compact);
}

function pushWarning(warnings: string[], message: string) {
  if (!warnings.includes(message)) warnings.push(message);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value.replace(/[,，]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

export function classifyCellKind(value: unknown): VisionCellKind {
  if (value == null || value === "") return "empty";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  const text = String(value).trim();
  if (!text) return "empty";
  if (/[%％]\s*$/.test(text) || /^-?\d+(\.\d+)?\s*[%％]$/.test(text)) return "percentage";
  if (/[¥￥$€£]|円/.test(text) && /-?\d/.test(text)) return "currency";
  if (
    /^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(text) ||
    /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(text)
  ) {
    return "date";
  }
  if (/^-?[\d,.，]+$/.test(text) && Number.isFinite(Number(text.replace(/[,，]/g, "")))) {
    return "number";
  }
  return "text";
}

function inferColumnTypes(table: VisionTable): VisionCellKind[] {
  const width = Math.max(
    table.headers?.length ?? 0,
    ...(table.rows ?? []).map((row) => row.length),
    0,
  );
  const types: VisionCellKind[] = [];
  for (let col = 0; col < width; col += 1) {
    const kinds = (table.rows ?? [])
      .map((row) => classifyCellKind(row[col]))
      .filter((kind) => kind !== "empty");
    const counts = new Map<VisionCellKind, number>();
    for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    let best: VisionCellKind = "unknown";
    let bestCount = 0;
    for (const [kind, count] of counts) {
      if (count > bestCount) {
        best = kind;
        bestCount = count;
      }
    }
    types.push(best);
  }
  return types;
}

function enrichTable(
  table: VisionTable,
  overallConfidence: number,
  extractedText: string,
  warnings: string[],
  chartMode: boolean,
): VisionTable {
  const columnTypes = table.columnTypes?.length
    ? table.columnTypes
    : inferColumnTypes(table);
  const cellConfidence =
    table.cellConfidence ??
    (table.rows ?? []).map((row) =>
      row.map((value) => {
        if (value == null || String(value).trim() === "") return Math.min(overallConfidence, 0.4);
        if (typeof value === "number" && chartMode && !textContainsNumber(extractedText, value)) {
          return 0.2;
        }
        return overallConfidence;
      }),
    );

  const rows = (table.rows ?? []).map((row, rowIndex) =>
    row.map((value, colIndex) => {
      if (!chartMode) return value;
      const numeric = toNumber(value);
      if (numeric == null) return value;
      if (textContainsNumber(extractedText, numeric)) return value;
      cellConfidence[rowIndex]![colIndex] = 0.2;
      return null;
    }),
  );

  if (
    chartMode &&
    rows.some((row, rowIndex) =>
      row.some((value, colIndex) => value == null && table.rows?.[rowIndex]?.[colIndex] != null),
    )
  ) {
    pushWarning(warnings, "具体値は判別不可。傾向のみ記録します。架空の精密数値は作っていません。");
  }

  return {
    ...table,
    rows,
    columnTypes,
    cellConfidence,
    notes:
      table.notes ||
      (table.headers?.length && /結合|多段/.test(table.notes ?? "")
        ? table.notes
        : table.notes ?? null),
  };
}

function nullUngroundedAmount(
  value: unknown,
  text: string,
  warnings: string[],
  field: string,
): number | null {
  if (value == null || value === "") return null;
  const numeric = toNumber(value);
  if (numeric == null) {
    pushWarning(warnings, `金額を判別できません（${field}）`);
    return null;
  }
  if (!text.trim()) {
    // No OCR text to ground against — keep value but mark low confidence via caller.
    return numeric;
  }
  if (!textContainsNumber(text, numeric)) {
    pushWarning(warnings, `金額を判別できません（${field}）`);
    return null;
  }
  return numeric;
}

function sanitizeLineItems(
  items: unknown,
  text: string,
  warnings: string[],
): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) return [];
  const next: Array<Record<string, unknown>> = [];
  for (const [index, raw] of items.entries()) {
    const item = asRecord(raw);
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) continue;
    if (text.trim() && !textContainsToken(text, name) && name.length >= 2) {
      pushWarning(
        warnings,
        `明細「${name}」は画像テキストから確認できないため除外しました`,
      );
      continue;
    }
    const prefix = `items[${index}]`;
    next.push({
      ...item,
      name,
      quantity:
        item.quantity == null || item.quantity === ""
          ? null
          : toNumber(item.quantity) ?? item.quantity,
      unitPrice: nullUngroundedAmount(item.unitPrice, text, warnings, `${prefix}.unitPrice`),
      amount: nullUngroundedAmount(item.amount, text, warnings, `${prefix}.amount`),
    });
  }
  return next;
}

function checkReceiptTotals(fields: VisionFieldMap, warnings: string[]) {
  const items = Array.isArray(fields.items) ? fields.items : [];
  const itemSum = items.reduce((sum: number, raw) => {
    const amount = toNumber(asRecord(raw).amount);
    return sum + (amount ?? 0);
  }, 0);
  const total = toNumber(fields.total);
  if (total == null || items.length === 0) return;
  const tax = toNumber(fields.tax) ?? 0;
  const discount = toNumber(fields.discount) ?? 0;
  const subtotal = toNumber(fields.subtotal) ?? itemSum;
  const reconstructed = subtotal + tax - Math.abs(discount);
  const close =
    Math.abs(itemSum - total) <= 1 || Math.abs(reconstructed - total) <= 1;
  if (!close) {
    pushWarning(
      warnings,
      `明細合計と合計金額が一致しません（明細合計 ${itemSum} / 合計 ${total}）。数字を合わせるために架空の行は追加していません。`,
    );
  }
}

function sanitizeFields(
  detectedType: string,
  fields: VisionFieldMap,
  extractedText: string,
  warnings: string[],
  missingFields: string[],
): VisionFieldMap {
  const next: VisionFieldMap = { ...fields };
  const text = extractedText;
  const amountKeys = ["total", "subtotal", "tax", "discount"] as const;

  if (
    detectedType === "receipt" ||
    detectedType === "invoice" ||
    detectedType === "estimate"
  ) {
    for (const key of amountKeys) {
      next[key] = nullUngroundedAmount(next[key], text, warnings, key);
    }
    if (Array.isArray(next.items) || detectedType === "receipt") {
      next.items = sanitizeLineItems(next.items, text, warnings);
      checkReceiptTotals(next, warnings);
    }
    if (Array.isArray(next.lineItems)) {
      next.lineItems = sanitizeLineItems(next.lineItems, text, warnings);
    }
    if (next.taxInclusive == null && next.taxExclusive == null) {
      if (/税込|内税/.test(text) && /税抜|外税/.test(text)) {
        pushWarning(warnings, "税込と税抜の記載が混在しています。混同せず未確定にしています。");
        next.taxInclusive = null;
      }
    }
    if (/軽減税率|8%|10%|８％|１０％/.test(text) && next.taxRates == null) {
      const rates: number[] = [];
      if (/8\s*%|８％|軽減/.test(text)) rates.push(8);
      if (/10\s*%|１０％/.test(text)) rates.push(10);
      if (rates.length > 0) next.taxRates = rates;
    }
  }

  if (typeof next.date === "string" && next.date.trim() && text.trim()) {
    if (!textContainsDate(text, next.date)) {
      pushWarning(warnings, "日付を判別できません");
      next.date = null;
      if (!missingFields.includes("date")) missingFields.push("date");
    }
  }

  const contactFields = ["email", "phone", "mobile", "url", "website", "contactInfo"] as const;
  for (const field of contactFields) {
    const value = next[field];
    if (typeof value !== "string" || !value.trim()) continue;
    if (text.trim() && !textContainsToken(text, value)) {
      next[field] = null;
      pushWarning(warnings, `${field} は画像テキストから確認できません`);
      if (!missingFields.includes(field)) missingFields.push(field);
    }
  }

  if (detectedType === "business_card") {
    const person = typeof next.personName === "string" ? next.personName.trim() : "";
    const company = typeof next.companyName === "string" ? next.companyName.trim() : "";
    if (person && company && person === company) {
      pushWarning(warnings, "氏名と会社名を区別できません");
    }
  }

  if (
    detectedType === "general_photo" ||
    detectedType === "equipment_photo" ||
    detectedType === "property_photo" ||
    detectedType === "whiteboard"
  ) {
    if (!next.observed && typeof next.scene === "string") {
      next.observed = next.scene;
    }
    if (typeof next.inference === "string" && /故障している|危険である|交換必須/.test(next.inference)) {
      pushWarning(
        warnings,
        "画像だけから故障・危険・交換必須とは断定していません。観測と推論を分けてください。",
      );
      next.inference = next.inference.replace(/故障している|危険である|交換必須/g, "要確認");
    }
  }

  if (detectedType === "handwritten_note" || detectedType === "whiteboard") {
    if (!next.rawText) next.rawText = extractedText || null;
    if (!next.cleanedText) next.cleanedText = extractedText || null;
  }

  if (detectedType === "chart") {
    const hasVisible =
      next.visibleValues != null ||
      (typeof next.series === "string" && /\d/.test(next.series));
    if (!hasVisible && !text.match(/\d/)) {
      next.visibleValues = null;
      pushWarning(warnings, "具体値は判別不可。傾向のみ記録します。");
    }
  }

  if (detectedType === "screenshot") {
    if (!next.errorCode && /error|エラー|exception/i.test(text)) {
      const match = text.match(/\b([A-Z]{2,}[-_]?\d{2,}|\d{3,})\b/);
      if (match) next.errorCode = match[1];
    }
  }

  return next;
}

function buildFieldConfidence(
  fields: VisionFieldMap,
  overall: number,
  warnings: string[],
): VisionFieldConfidence {
  const next: VisionFieldConfidence = { overall };
  const warned = warnings.join(" ");
  const mark = (field: string, value: unknown) => {
    if (value == null || value === "") {
      next[field] = 0.2;
      return;
    }
    next[field] = warned.includes(field) || warned.includes("判別できません")
      ? Math.min(overall, 0.35)
      : overall;
  };
  mark("storeName", fields.storeName);
  mark("date", fields.date);
  mark("time", fields.time);
  mark("total", fields.total);
  mark("subtotal", fields.subtotal);
  mark("tax", fields.tax);
  mark("issuer", fields.issuer);
  mark("recipient", fields.recipient);
  mark("documentNumber", fields.documentNumber ?? fields.invoiceNumber);
  mark("personName", fields.personName);
  mark("companyName", fields.companyName);
  mark("email", fields.email);
  mark("phone", fields.phone);
  return next;
}

export function sanitizeVisionModelPayload(
  payload: VisionModelPayload,
): VisionModelPayload & { fieldConfidence?: VisionFieldConfidence } {
  const warnings = [...(payload.warnings ?? [])];
  const missingFields = [...(payload.missingFields ?? [])];
  const extractedText = groundingText(payload.extractedText);
  const tables = (payload.tables ?? []).map((table) =>
    enrichTable(
      table,
      payload.confidence,
      extractedText,
      warnings,
      payload.detectedType === "chart",
    ),
  );
  const fields = sanitizeFields(
    payload.detectedType,
    payload.fields ?? {},
    extractedText,
    warnings,
    missingFields,
  );
  const fieldConfidence = buildFieldConfidence(fields, payload.confidence, warnings);
  const unreadable = warnings.some((item) => item.includes("判別できません"));
  return {
    ...payload,
    fields,
    tables,
    warnings,
    missingFields,
    fieldConfidence,
    confidence: unreadable ? Math.min(payload.confidence, 0.45) : payload.confidence,
  };
}

export function sanitizeVisionAnalysisResult(
  result: VisionAnalysisResult,
): VisionAnalysisResult {
  const parsed: VisionAnalysisParsed = {
    id: result.id,
    attachmentId: result.attachmentId,
    detectedType: result.detectedType,
    confidence: result.confidence,
    summary: result.summary,
    extractedText: result.extractedText,
    language: result.language,
    fields: result.fields,
    tables: result.tables,
    visualElements: result.visualElements,
    layout: result.layout,
    styleSignals: result.styleSignals,
    warnings: result.warnings,
    missingFields: result.missingFields,
    recommendedActions: result.recommendedActions,
    artifactSuggestions: result.artifactSuggestions,
    model: result.model,
    detailLevel: result.detailLevel,
    createdAt: result.createdAt,
  };
  const sanitized = sanitizeVisionModelPayload({
    detectedType: parsed.detectedType,
    confidence: parsed.confidence,
    summary: parsed.summary,
    extractedText: parsed.extractedText,
    language: parsed.language,
    fields: parsed.fields,
    tables: parsed.tables,
    visualElements: parsed.visualElements,
    layout: parsed.layout,
    styleSignals: parsed.styleSignals,
    warnings: parsed.warnings,
    missingFields: parsed.missingFields,
    recommendedActions: parsed.recommendedActions,
    artifactSuggestions: parsed.artifactSuggestions,
  });
  return {
    ...result,
    detectedType: sanitized.detectedType,
    confidence: sanitized.confidence,
    summary: sanitized.summary,
    extractedText: sanitized.extractedText ?? null,
    language: sanitized.language ?? null,
    fields: sanitized.fields ?? {},
    tables: sanitized.tables ?? [],
    warnings: sanitized.warnings ?? [],
    missingFields: sanitized.missingFields ?? [],
    fieldConfidence: sanitized.fieldConfidence,
  };
}

export function scoreExactMatch(expected: unknown, actual: unknown): boolean {
  if (expected == null && actual == null) return true;
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(expected - actual) < 0.009;
  }
  return String(expected ?? "").trim() === String(actual ?? "").trim();
}
