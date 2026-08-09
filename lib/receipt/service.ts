import "server-only";

import { randomUUID } from "crypto";

import {
  ensureHouseholdLedgerHydrated,
  schedulePersistHouseholdLedger,
  HOUSEHOLD_LEDGER_DOMAIN_KEY,
} from "./durable";
import { buildHouseholdLedgerWorkbook } from "./excel";
import {
  confirmAndRegisterReceipt,
  getLedgerAnalytics,
  runReceiptPipeline,
  type ConfirmReceiptInput,
  type ProcessReceiptInput,
} from "./pipeline";
import {
  deleteLedgerEntryForUser,
  getLedgerEntryForUser,
  getReceiptSession,
  listCategoryRules,
  listLedgerEntries,
  replaceCategoryRules,
  updateLedgerEntryForUser,
  upsertLedgerEntries,
} from "./store";
import { learnCategoryCorrection } from "./categorize";
import type {
  LedgerEntry,
  MoneyUse,
  ReceiptCategory,
} from "./types";

export { HOUSEHOLD_LEDGER_DOMAIN_KEY };

export async function processReceiptImages(
  input: ProcessReceiptInput,
) {
  await ensureHouseholdLedgerHydrated(input.userId);
  return runReceiptPipeline(input);
}

export async function confirmReceiptSession(input: ConfirmReceiptInput) {
  await ensureHouseholdLedgerHydrated(input.userId);
  return confirmAndRegisterReceipt(input);
}

export async function listHouseholdEntries(
  userId: string,
  options?: { limit?: number; offset?: number; fromDate?: string; toDate?: string },
) {
  await ensureHouseholdLedgerHydrated(userId);
  return listLedgerEntries(userId, options);
}

export async function createManualLedgerEntry(input: {
  userId: string;
  amountInclTax: number;
  date: string;
  category: ReceiptCategory;
  storeName?: string;
  itemName?: string;
  note?: string;
  currency?: string;
  moneyUse?: MoneyUse;
}): Promise<LedgerEntry> {
  await ensureHouseholdLedgerHydrated(input.userId);
  const now = new Date().toISOString();
  const entry: LedgerEntry = {
    id: randomUUID(),
    userId: input.userId,
    receiptId: "",
    date: input.date,
    storeName: input.storeName ?? "",
    category: input.category,
    itemName: input.itemName ?? "手動登録",
    quantity: 1,
    unitPrice: input.amountInclTax,
    tax: 0,
    amountInclTax: input.amountInclTax,
    paymentMethod: "",
    note: input.note ?? "",
    moneyUse: input.moneyUse ?? "personal",
    sourceImageIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await upsertLedgerEntries(input.userId, [entry]);
  return entry;
}

export async function updateLedgerEntryCategory(input: {
  userId: string;
  entryId: string;
  category: ReceiptCategory;
}): Promise<LedgerEntry | null> {
  await ensureHouseholdLedgerHydrated(input.userId);
  const current = await getLedgerEntryForUser(input.userId, input.entryId);
  if (!current) return null;
  const updated = await updateLedgerEntryForUser(
    input.userId,
    input.entryId,
    { category: input.category },
  );
  if (!updated) return null;
  const rules = learnCategoryCorrection(
    listCategoryRules(input.userId),
    updated.storeName,
    input.category,
  );
  replaceCategoryRules(input.userId, rules);
  schedulePersistHouseholdLedger(input.userId);
  return updated;
}

export async function updateHouseholdLedgerEntry(input: {
  userId: string;
  entryId: string;
  patch: Partial<
    Pick<
      LedgerEntry,
      | "category"
      | "storeName"
      | "itemName"
      | "note"
      | "amountInclTax"
      | "date"
      | "quantity"
      | "unitPrice"
      | "tax"
      | "paymentMethod"
      | "moneyUse"
    >
  >;
}): Promise<LedgerEntry | null> {
  await ensureHouseholdLedgerHydrated(input.userId);
  return updateLedgerEntryForUser(input.userId, input.entryId, input.patch);
}

export async function deleteHouseholdLedgerEntry(input: {
  userId: string;
  entryId: string;
}): Promise<boolean> {
  await ensureHouseholdLedgerHydrated(input.userId);
  return deleteLedgerEntryForUser(input.userId, input.entryId);
}

export async function exportHouseholdExcel(
  userId: string,
  yearMonth?: string,
): Promise<{ filename: string; buffer: Buffer }> {
  await ensureHouseholdLedgerHydrated(userId);
  const entries = await listLedgerEntries(userId);
  const buffer = await buildHouseholdLedgerWorkbook(entries, { yearMonth });
  const ym = yearMonth ?? new Date().toISOString().slice(0, 7);
  return {
    filename: `minervot-household-${ym}.xlsx`,
    buffer,
  };
}

export async function getHouseholdAnalytics(userId: string, yearMonth: string) {
  await ensureHouseholdLedgerHydrated(userId);
  return getLedgerAnalytics(userId, yearMonth);
}

export async function getHouseholdSession(userId: string, sessionId: string) {
  await ensureHouseholdLedgerHydrated(userId);
  return getReceiptSession(userId, sessionId);
}
