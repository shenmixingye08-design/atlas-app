import "server-only";

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
  getReceiptSession,
  listCategoryRules,
  listLedgerEntries,
  replaceCategoryRules,
  upsertLedgerEntries,
} from "./store";
import { learnCategoryCorrection } from "./categorize";
import type { LedgerEntry, ReceiptCategory } from "./types";

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

export async function listHouseholdEntries(userId: string) {
  await ensureHouseholdLedgerHydrated(userId);
  return listLedgerEntries(userId);
}

export async function updateLedgerEntryCategory(input: {
  userId: string;
  entryId: string;
  category: ReceiptCategory;
}): Promise<LedgerEntry | null> {
  await ensureHouseholdLedgerHydrated(input.userId);
  const entries = listLedgerEntries(input.userId);
  const current = entries.find((entry) => entry.id === input.entryId);
  if (!current) return null;
  const updated: LedgerEntry = {
    ...current,
    category: input.category,
    updatedAt: new Date().toISOString(),
  };
  upsertLedgerEntries(input.userId, [updated]);
  const rules = learnCategoryCorrection(
    listCategoryRules(input.userId),
    updated.storeName,
    input.category,
  );
  replaceCategoryRules(input.userId, rules);
  schedulePersistHouseholdLedger(input.userId);
  return updated;
}

export async function exportHouseholdExcel(
  userId: string,
  yearMonth?: string,
): Promise<{ filename: string; buffer: Buffer }> {
  await ensureHouseholdLedgerHydrated(userId);
  const entries = listLedgerEntries(userId);
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
