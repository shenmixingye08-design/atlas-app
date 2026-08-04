import type { LowConfidenceField, ReceiptSchema } from "./types";

const LOW = 0.72;

const STORE_CANDIDATES = [
  "ローソン",
  "セブンイレブン",
  "ファミリーマート",
  "ミニストップ",
  "イオン",
];

function conf(schema: ReceiptSchema, field: string, fallback: number): number {
  const value = schema.fieldConfidence[field];
  return typeof value === "number" ? value : fallback;
}

/**
 * Only ask about low-confidence critical fields (never quiz everything).
 */
export function collectLowConfidenceFields(
  schemas: ReceiptSchema[],
): LowConfidenceField[] {
  const fields: LowConfidenceField[] = [];
  const primary = schemas[0];
  if (!primary) return fields;

  const storeConf = conf(
    primary,
    "storeName",
    primary.storeName ? primary.overallConfidence : 0.3,
  );
  if (!primary.storeName || storeConf < LOW) {
    fields.push({
      field: "storeName",
      label: "店名",
      currentValue: primary.storeName,
      confidence: storeConf,
      candidates: STORE_CANDIDATES.filter((name) => name !== primary.storeName).slice(
        0,
        3,
      ),
    });
  }

  const dateConf = conf(
    primary,
    "date",
    primary.date ? primary.overallConfidence : 0.3,
  );
  if (!primary.date || dateConf < LOW) {
    fields.push({
      field: "date",
      label: "日付",
      currentValue: primary.date,
      confidence: dateConf,
      candidates: [],
    });
  }

  const totalConf = conf(
    primary,
    "total",
    primary.total != null ? primary.overallConfidence : 0.3,
  );
  if (primary.total == null || totalConf < LOW) {
    fields.push({
      field: "total",
      label: "合計金額",
      currentValue: primary.total != null ? String(primary.total) : null,
      confidence: totalConf,
      candidates: [],
    });
  }

  return fields.slice(0, 3);
}

export function applyFieldAnswers(
  schemas: ReceiptSchema[],
  answers: Record<string, string>,
): ReceiptSchema[] {
  if (schemas.length === 0) return schemas;
  const next = schemas.map((schema) => ({ ...schema }));
  const primary = { ...next[0]! };
  if (answers.storeName?.trim()) {
    primary.storeName = answers.storeName.trim();
    primary.fieldConfidence = {
      ...primary.fieldConfidence,
      storeName: 1,
    };
  }
  if (answers.date?.trim()) {
    primary.date = answers.date.trim();
    primary.fieldConfidence = { ...primary.fieldConfidence, date: 1 };
  }
  if (answers.total?.trim()) {
    const n = Number(answers.total.replace(/[,円￥\\s]/g, ""));
    if (Number.isFinite(n)) {
      primary.total = n;
      primary.fieldConfidence = { ...primary.fieldConfidence, total: 1 };
    }
  }
  next[0] = primary;
  return next;
}
