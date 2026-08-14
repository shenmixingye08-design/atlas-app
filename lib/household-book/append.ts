/**
 * Appendable household-book model for 「追加して」.
 * Persists complete rows through the existing receipt ledger store.
 * Does not call receipt Vision extract / runReceiptPipeline.
 */

import type { HouseholdBookDocument, HouseholdCategoryOrOpen, HouseholdLine } from "@/lib/household-book/types";
import type { LedgerEntry, ReceiptCategory } from "@/lib/receipt/types";

const TO_LEDGER_CATEGORY: Record<HouseholdCategoryOrOpen, ReceiptCategory> = {
  食費: "食費",
  日用品: "日用品",
  交通費: "交通費",
  医療費: "医療",
  娯楽: "趣味",
  衣服: "その他",
  美容: "その他",
  通信費: "その他",
  光熱費: "光熱費",
  住居費: "その他",
  教育: "その他",
  仕事: "仕事",
  その他: "その他",
  未分類: "その他",
};

export function mergeHouseholdDocuments(
  existing: HouseholdBookDocument | null,
  incoming: HouseholdBookDocument,
): HouseholdBookDocument {
  if (!existing) return incoming;
  const seen = new Set(existing.receipts.map((receipt) => receipt.receiptKey));
  const receipts = [...existing.receipts];
  for (const receipt of incoming.receipts) {
    if (seen.has(receipt.receiptKey)) continue;
    receipts.push(receipt);
    seen.add(receipt.receiptKey);
  }
  const lines = receipts.flatMap((receipt) => receipt.items);
  const totalSpend = receipts.every((receipt) => receipt.total == null)
    ? incoming.totalSpend
    : receipts.reduce((sum, receipt) => sum + (receipt.total ?? 0), 0);
  return {
    ...incoming,
    id: existing.id,
    receipts,
    lines,
    receiptCount: receipts.length,
    totalSpend,
    yearMonth: existing.yearMonth ?? incoming.yearMonth,
    warnings: [...existing.warnings, ...incoming.warnings],
    userMessages: [...new Set([...existing.userMessages, ...incoming.userMessages])],
    completeness:
      existing.completeness === "blocked" || incoming.completeness === "blocked"
        ? existing.receipts.length + incoming.receipts.length === 0
          ? "blocked"
          : "partial"
        : existing.completeness === "complete" && incoming.completeness === "complete"
          ? "complete"
          : "partial",
    appendable: existing.appendable && incoming.appendable,
  };
}

export function persistableHouseholdLines(book: HouseholdBookDocument): HouseholdLine[] {
  if (!book.appendable) return [];
  return book.lines.filter(
    (line) =>
      Boolean(line.purchaseDate) &&
      line.amount != null &&
      Boolean(line.itemName) &&
      line.itemName !== "（商品名を読み取れませんでした）",
  );
}

export function toLedgerEntries(
  userId: string,
  book: HouseholdBookDocument,
  now = new Date(),
): LedgerEntry[] {
  const iso = now.toISOString();
  return persistableHouseholdLines(book).map((line, index) => ({
    id: `hble_${book.id}_${index}`,
    userId,
    receiptId: line.receiptKey,
    date: line.purchaseDate!,
    storeName: line.storeName ?? "",
    category: TO_LEDGER_CATEGORY[line.category],
    itemName: line.itemName!,
    quantity: line.quantity ?? 1,
    unitPrice: line.unitPrice ?? line.amount ?? 0,
    tax: line.tax ?? 0,
    amountInclTax: line.amount!,
    paymentMethod: line.paymentMethod ?? "",
    note: line.memo ?? "",
    moneyUse: "personal",
    sourceImageIds: line.attachmentId ? [line.attachmentId] : [],
    createdAt: iso,
    updatedAt: iso,
  }));
}
