/**
 * Normalize Vision SoT receipt results into a household book.
 * No extra AI. Uses mergeVisionBatch / groupVisionImages for multi-image.
 */

import { classifyHouseholdCategory } from "@/lib/household-book/categories";
import { isHouseholdBookRequest, isHouseholdLanguage } from "@/lib/household-book/intent";
import type {
  HouseholdBookDocument,
  HouseholdLine,
  HouseholdPreferences,
  HouseholdReceipt,
  HouseholdWarning,
} from "@/lib/household-book/types";
import { groupVisionImages } from "@/lib/vision/merge-batch";
import type {
  VisionAnalysisResult,
  VisionBatchResult,
  VisionDetectedType,
} from "@/lib/vision/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseHouseholdNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[,，\s¥￥円$€]/g, "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseHouseholdDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  }
  const ja = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})/);
  if (ja) {
    return `${ja[1]}-${pad2(ja[2])}-${pad2(ja[3])}`;
  }
  return null;
}

function pad2(value: string | undefined): string {
  return String(value ?? "").padStart(2, "0");
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() && value.trim() !== "要確認") {
      return value.trim();
    }
  }
  return null;
}

function warn(
  code: HouseholdWarning["code"],
  message: string,
  attachmentId: string | null,
  field?: string,
): HouseholdWarning {
  return { code, message, attachmentId, field };
}

function uniqueNumbers(values: unknown[]): number[] {
  const nums = values
    .map((value) => parseHouseholdNumber(value))
    .filter((value): value is number => value != null);
  return [...new Set(nums)];
}

function pickBestItems(images: VisionAnalysisResult[]): unknown[] {
  let best: unknown[] = [];
  for (const image of images) {
    const items = image.fields.items;
    if (Array.isArray(items) && items.length > best.length) {
      best = items;
    }
  }
  return best;
}

function lineFromItem(input: {
  item: unknown;
  receipt: Omit<HouseholdReceipt, "items" | "warnings"> & {
    warnings: HouseholdWarning[];
  };
  image: VisionAnalysisResult;
  preferences?: HouseholdPreferences | null;
}): HouseholdLine {
  const record = asRecord(input.item);
  const itemName = firstText(record.name, record.itemName, record.title);
  const quantity = parseHouseholdNumber(record.quantity ?? record.qty);
  const unitPrice = parseHouseholdNumber(record.unitPrice ?? record.price);
  const amount = parseHouseholdNumber(record.amount ?? record.amountInclTax);
  const warnings: HouseholdWarning[] = [];
  if (!itemName) {
    warnings.push(
      warn("unreadable_item", "一部の商品名を読み取れませんでした", input.image.attachmentId, "itemName"),
    );
  }
  if (amount == null && (record.amount != null || record.amountInclTax != null)) {
    warnings.push(
      warn("unreadable_amount", "金額を読み取れませんでした", input.image.attachmentId, "amount"),
    );
  }
  if (amount == null && record.amount == null && record.amountInclTax == null) {
    warnings.push(
      warn("unreadable_amount", "金額を読み取れませんでした", input.image.attachmentId, "amount"),
    );
  }

  const classified = classifyHouseholdCategory({
    storeName: input.receipt.storeName,
    itemName,
    visionCategory: firstText(record.category),
    preferences: input.preferences,
  });
  if (!classified.confident) {
    warnings.push(
      warn(
        "uncertain_category",
        "カテゴリを確定できなかったため「その他」にしています",
        input.image.attachmentId,
        "category",
      ),
    );
  }

  return {
    receiptKey: input.receipt.receiptKey,
    purchaseDate: input.receipt.purchaseDate,
    storeName: input.receipt.storeName,
    itemName,
    quantity,
    unitPrice,
    amount,
    subtotal: input.receipt.subtotal,
    tax: input.receipt.tax,
    total: input.receipt.total,
    paymentMethod: input.receipt.paymentMethod,
    category: classified.category,
    categoryConfident: classified.confident,
    memo: firstText(record.notes, record.memo),
    attachmentId: input.image.attachmentId,
    confidence: input.image.confidence,
    warnings,
  };
}

function receiptFromGroup(input: {
  images: VisionAnalysisResult[];
  groupKey: string;
  kind: HouseholdReceipt["kind"];
  preferences?: HouseholdPreferences | null;
}): HouseholdReceipt {
  const fields = input.images.map((image) => asRecord(image.fields));
  const attachmentIds = input.images.map((image) => image.attachmentId);
  const primary = input.images[0]!;
  const storeName = firstText(
    ...fields.map((field) => field.storeName),
    ...fields.map((field) => field.store),
  );
  const purchaseDate = parseHouseholdDate(
    firstText(
      ...fields.map((field) => field.date),
      ...fields.map((field) => field.purchaseDate),
      ...fields.map((field) => field.issueDate),
    ),
  );
  const paymentMethod = firstText(...fields.map((field) => field.paymentMethod));
  const totals = uniqueNumbers(fields.map((field) => field.total));
  const subtotals = uniqueNumbers(fields.map((field) => field.subtotal));
  const taxes = uniqueNumbers(fields.map((field) => field.tax));
  const warnings: HouseholdWarning[] = [];

  let total: number | null = null;
  if (totals.length === 1) {
    total = totals[0]!;
  } else if (totals.length > 1) {
    warnings.push(
      warn(
        "double_count_prevented",
        "複数面の合計が一致しないため合計金額は未確定です",
        primary.attachmentId,
        "total",
      ),
    );
  } else {
    warnings.push(
      warn("unreadable_total", "合計金額を読み取れませんでした", primary.attachmentId, "total"),
    );
  }

  if (!purchaseDate) {
    warnings.push(
      warn("unreadable_date", "購入日を読み取れませんでした", primary.attachmentId, "date"),
    );
  }
  if (!storeName) {
    warnings.push(
      warn("unreadable_store", "店舗名を読み取れませんでした", primary.attachmentId, "storeName"),
    );
  }

  if (
    (input.kind === "receipt_sides" || input.kind === "pages") &&
    input.images.length > 1
  ) {
    warnings.push(
      warn(
        "double_count_prevented",
        "同じレシートの表裏／ページを1件として扱い、合計の二重計上を避けました",
        primary.attachmentId,
      ),
    );
  }

  const header = {
    receiptKey: input.groupKey,
    kind: input.kind,
    attachmentIds,
    purchaseDate,
    storeName,
    subtotal: subtotals.length === 1 ? subtotals[0]! : null,
    tax: taxes.length === 1 ? taxes[0]! : null,
    total,
    paymentMethod,
    confidence: Math.min(...input.images.map((image) => image.confidence)),
    warnings,
  };

  const rawItems = pickBestItems(input.images);
  const sourceImage =
    input.images.find((image) => Array.isArray(image.fields.items) && image.fields.items.length) ??
    primary;

  const items =
    rawItems.length > 0
      ? rawItems.map((item) =>
          lineFromItem({
            item,
            receipt: header,
            image: sourceImage,
            preferences: input.preferences,
          }),
        )
      : [
          {
            receiptKey: header.receiptKey,
            purchaseDate: header.purchaseDate,
            storeName: header.storeName,
            itemName: firstText(primary.summary) ?? "（商品名を読み取れませんでした）",
            quantity: null,
            unitPrice: null,
            amount: total,
            subtotal: header.subtotal,
            tax: header.tax,
            total,
            paymentMethod: header.paymentMethod,
            category: classifyHouseholdCategory({
              storeName,
              itemName: firstText(primary.summary),
              preferences: input.preferences,
            }).category,
            categoryConfident: false,
            memo: null,
            attachmentId: primary.attachmentId,
            confidence: primary.confidence,
            warnings: [
              warn(
                "unreadable_item",
                "商品明細を読み取れませんでした",
                primary.attachmentId,
                "items",
              ),
            ],
          } satisfies HouseholdLine,
        ];

  const itemSum = items
    .map((line) => line.amount)
    .filter((value): value is number => value != null)
    .reduce((sum, value) => sum + value, 0);
  if (total != null && items.some((line) => line.amount != null) && Math.abs(itemSum - total) > 1) {
    header.warnings.push(
      warn(
        "item_total_mismatch",
        "商品合計とレシート合計が一致しないため、集計はレシート合計を優先します",
        primary.attachmentId,
        "total",
      ),
    );
  }

  return { ...header, items, warnings: header.warnings };
}

function yearMonthFrom(input: {
  dates: Array<string | null>;
  assignment: string;
  now?: Date;
}): string | null {
  const first = input.dates.find((value) => value && /^\d{4}-\d{2}/.test(value));
  if (first) return first.slice(0, 7);
  if (/今月/.test(input.assignment) && input.now) {
    return `${input.now.getUTCFullYear()}-${String(input.now.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

function spendFromReceipts(receipts: HouseholdReceipt[]): number | null {
  let total = 0;
  let any = false;
  for (const receipt of receipts) {
    if (receipt.total != null) {
      total += receipt.total;
      any = true;
      continue;
    }
    const itemSum = receipt.items
      .map((line) => line.amount)
      .filter((value): value is number => value != null);
    if (itemSum.length > 0) {
      total += itemSum.reduce((sum, value) => sum + value, 0);
      any = true;
    }
  }
  return any ? total : null;
}

export function householdBookFromVision(
  batch: VisionBatchResult,
  options?: {
    assignment?: string;
    preferences?: HouseholdPreferences | null;
    now?: Date;
  },
): HouseholdBookDocument {
  const assignment = options?.assignment ?? "";
  const images = batch.images;
  const groups = groupVisionImages(images);
  const warnings: HouseholdWarning[] = batch.warnings.map((message) =>
    warn(
      /二重計上|混ぜていません|複数面/.test(message)
        ? "double_count_prevented"
        : "partial_items",
      message,
      images[0]?.attachmentId ?? null,
    ),
  );

  const receiptGroups = groups.filter((group) =>
    group.imageIndexes.some((index) => images[index]?.detectedType === "receipt"),
  );
  const nonReceipt = images.filter((image) => image.detectedType !== "receipt");

  if (isHouseholdLanguage(assignment) && receiptGroups.length === 0) {
    warnings.push(
      warn(
        "not_a_receipt",
        "レシートではないため、家計簿にできませんでした",
        images[0]?.attachmentId ?? null,
      ),
    );
  }

  const receipts = receiptGroups.map((group) =>
    receiptFromGroup({
      images: group.imageIndexes.map((index) => images[index]!),
      groupKey: group.key,
      kind: group.kind,
      preferences: options?.preferences,
    }),
  );

  const lines = receipts.flatMap((receipt) => receipt.items);
  const userMessages = [
    ...receipts.flatMap((receipt) => receipt.warnings.map((row) => row.message)),
    ...lines.flatMap((line) => line.warnings.map((row) => row.message)),
    ...warnings.map((row) => row.message),
  ].filter((message, index, all) => all.indexOf(message) === index);

  const hasReceipt = receipts.length > 0;
  const moneyReadable = receipts.some(
    (receipt) =>
      receipt.total != null || receipt.items.some((line) => line.amount != null),
  );
  const completeness: HouseholdBookDocument["completeness"] = !hasReceipt
    ? "blocked"
    : receipts.every(
          (receipt) => receipt.total != null && receipt.purchaseDate != null,
        )
      ? "complete"
      : moneyReadable
        ? "partial"
        : "blocked";

  if (completeness !== "complete") {
    if (!hasReceipt && isHouseholdBookRequest(assignment, dominantType(batch))) {
      userMessages.unshift("レシートではないため、家計簿にできませんでした");
    }
    if (hasReceipt && !receipts.some((receipt) => receipt.total != null)) {
      userMessages.unshift("合計金額を読み取れませんでした");
    }
  }

  for (const image of nonReceipt) {
    if (image.detectedType === "unknown") continue;
    if (isHouseholdLanguage(assignment)) {
      warnings.push(
        warn(
          "not_a_receipt",
          "レシートではないため、家計簿にできませんでした",
          image.attachmentId,
        ),
      );
    }
  }

  return {
    id: `hbook_${batch.id}`,
    sourceBatchId: batch.id,
    yearMonth: yearMonthFrom({
      dates: receipts.map((receipt) => receipt.purchaseDate),
      assignment,
      now: options?.now,
    }),
    receipts,
    lines,
    warnings: [...warnings, ...receipts.flatMap((receipt) => receipt.warnings)],
    userMessages: [...new Set(userMessages)],
    completeness,
    appendable:
      completeness === "complete" &&
      receipts.every((receipt) => receipt.total != null && receipt.purchaseDate != null),
    receiptCount: receipts.length,
    totalSpend: spendFromReceipts(receipts),
  };
}

function dominantType(batch: VisionBatchResult): VisionDetectedType {
  return (
    (batch.commonFields.detectedType as VisionDetectedType | undefined) ??
    batch.images[0]?.detectedType ??
    "unknown"
  );
}

export function shouldBuildHouseholdBook(
  batch: VisionBatchResult,
  assignment = "",
): boolean {
  const type = dominantType(batch);
  if (type === "table" || type === "spreadsheet_source") return false;
  if (type === "receipt") return isHouseholdBookRequest(assignment, type);
  return batch.recommendedArtifactType === "household_excel" && type !== "invoice";
}
