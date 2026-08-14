/**
 * 複数画像の独立解析結果を、ページ順を保ったまま結合する。
 * 別レシートの数字は混ぜない。表裏の重複合計は避ける。追加 LLM なし。
 */

import type {
  VisionAnalysisResult,
  VisionFieldMap,
  VisionTable,
} from "@/lib/vision/types";

export type VisionDocumentGroup = {
  key: string;
  kind: "pages" | "receipt_sides" | "separate_documents" | "site_photos" | "mixed";
  imageIndexes: number[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function identityKey(image: VisionAnalysisResult, index: number): string {
  const fields = asRecord(image.fields);
  const store = String(fields.storeName ?? fields.issuer ?? "").trim();
  const number = String(
    fields.documentNumber ?? fields.invoiceNumber ?? fields.estimateNumber ?? "",
  ).trim();
  const date = String(fields.date ?? fields.issueDate ?? "").trim();
  const type = image.detectedType;
  if (
    type === "general_photo" ||
    type === "equipment_photo" ||
    type === "property_photo" ||
    type === "whiteboard"
  ) {
    return `site:${type}`;
  }
  if (number) return `${type}:${number}`;
  if (store && date) return `${type}:${store}:${date}`;
  if (store) return `${type}:${store}`;
  return `${type}:${image.attachmentId || index}`;
}

export function groupVisionImages(
  images: VisionAnalysisResult[],
): VisionDocumentGroup[] {
  const buckets = new Map<string, number[]>();
  images.forEach((image, index) => {
    const key = identityKey(image, index);
    const list = buckets.get(key) ?? [];
    list.push(index);
    buckets.set(key, list);
  });

  const groups: VisionDocumentGroup[] = [];
  for (const [key, imageIndexes] of buckets) {
    const types = new Set(imageIndexes.map((index) => images[index]!.detectedType));
    const photoLike =
      types.size === 1 &&
      (types.has("general_photo") ||
        types.has("equipment_photo") ||
        types.has("property_photo") ||
        types.has("whiteboard"));
    const receiptLike =
      types.has("receipt") || types.has("invoice") || types.has("estimate");
    let kind: VisionDocumentGroup["kind"] = "separate_documents";
    if (photoLike) kind = "site_photos";
    else if (imageIndexes.length > 1 && receiptLike && key.split(":").length >= 2) {
      kind = types.has("receipt") && !key.includes("INV") && !/\d{3,}/.test(key)
        ? "receipt_sides"
        : "pages";
    } else if (imageIndexes.length > 1 && receiptLike) {
      kind = "receipt_sides";
    } else if (imageIndexes.length > 1) {
      kind = "mixed";
    }
    groups.push({ key, kind, imageIndexes });
  }
  return groups.sort(
    (a, b) => Math.min(...a.imageIndexes) - Math.min(...b.imageIndexes),
  );
}

function mergeTables(images: VisionAnalysisResult[]): VisionTable[] {
  const merged: VisionTable[] = [];
  images.forEach((image, index) => {
    for (const table of image.tables ?? []) {
      merged.push({
        ...table,
        notes: table.notes
          ? `画像${index + 1}: ${table.notes}`
          : `画像${index + 1}の表`,
      });
    }
  });
  return merged;
}

function pickCommonFields(images: VisionAnalysisResult[]): VisionFieldMap {
  const groups = groupVisionImages(images);
  const fields: VisionFieldMap = {
    imageCount: images.length,
    documentGroups: groups.map((group) => ({
      key: group.key,
      kind: group.kind,
      imageIndexes: group.imageIndexes.map((index) => index + 1),
    })),
  };

  const byGroup = new Map<string, VisionAnalysisResult[]>();
  images.forEach((image, index) => {
    const key = identityKey(image, index);
    const list = byGroup.get(key) ?? [];
    list.push(image);
    byGroup.set(key, list);
  });

  if (byGroup.size === 1) {
    const only = [...byGroup.values()][0] ?? [];
    const docs = only.map((image) => asRecord(image.fields));
    const first = docs[0] ?? {};
    for (const key of Object.keys(first)) {
      if (["items", "lineItems"].includes(key)) continue;
      const values = docs
        .map((doc) => doc[key])
        .filter((value) => value != null && value !== "");
      const unique = new Set(values.map((value) => JSON.stringify(value)));
      if (unique.size === 1) fields[key] = values[0];
    }
    const group = groups[0];
    if (group?.kind === "receipt_sides" || group?.kind === "pages") {
      const totals = docs
        .map((doc) => doc.total)
        .filter((value): value is number => typeof value === "number");
      const uniqueTotals = new Set(totals);
      if (uniqueTotals.size > 1) {
        fields.total = null;
        fields.totalNote = "複数面の合計が一致しないため未確定";
      } else if (uniqueTotals.size === 1) {
        fields.total = totals[0];
      }
    }
    return fields;
  }

  fields.separateDocuments = [...byGroup.entries()].map(([key, list]) => ({
    key,
    imageIndexes: list.map((image) => (image.pageIndex ?? 0) + 1),
    totals: list
      .map((image) => asRecord(image.fields).total)
      .filter((value) => typeof value === "number"),
  }));
  return fields;
}

export function mergeVisionBatch(images: VisionAnalysisResult[]): {
  commonFields: VisionFieldMap;
  mergedTables: VisionTable[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const groups = groupVisionImages(images);
  const receiptGroups = groups.filter((group) =>
    group.imageIndexes.some((index) => images[index]?.detectedType === "receipt"),
  );
  if (receiptGroups.length > 1) {
    warnings.push(
      "複数の別レシートを1件の合計に混ぜていません。画像ごとに別documentとして保持します。",
    );
  }
  for (const group of groups) {
    if (
      (group.kind === "receipt_sides" || group.kind === "pages") &&
      group.imageIndexes.length > 1
    ) {
      const pages = group.imageIndexes.map((index) => index + 1).join("と");
      warnings.push(
        `画像${pages}は同一書類の複数面として扱い、合計の二重計上を避けました。`,
      );
    }
  }
  return {
    commonFields: pickCommonFields(images),
    mergedTables: mergeTables(images),
    warnings,
  };
}
