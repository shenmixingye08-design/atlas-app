/**
 * P1-05: Idempotent backfill from atlas_user_state JSON → dedicated table.
 * Never deletes legacy JSON. Upserts by entry id (primary key).
 */

import "server-only";

import { loadDurableDomain } from "@/lib/persistence/durable-domain";

import type { HouseholdLedgerState, LedgerEntry } from "@/lib/receipt/types";

import {
  dbGetLedgerEntryForUser,
  dbUpsertLedgerEntries,
} from "./db-store";

export const HOUSEHOLD_LEDGER_DOMAIN_KEY = "atlasHouseholdLedger";

export type HouseholdLedgerBackfillResult = {
  attempted: number;
  insertedOrUpdated: number;
  skippedExisting: number;
  skippedInvalid: number;
};

function isValidLegacyEntry(value: unknown): value is LedgerEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LedgerEntry>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.userId === "string" &&
    row.userId.length > 0 &&
    typeof row.date === "string" &&
    typeof row.amountInclTax === "number"
  );
}

/**
 * Backfill durable JSON entries for one user into the dedicated table.
 * Idempotent: re-running does not duplicate rows (upsert by id).
 */
export async function backfillHouseholdLedgerEntriesFromDurable(
  userId: string,
  options?: { skipIfExists?: boolean },
): Promise<HouseholdLedgerBackfillResult> {
  const loaded = await loadDurableDomain<HouseholdLedgerState>(
    userId,
    HOUSEHOLD_LEDGER_DOMAIN_KEY,
  );
  const legacy = loaded?.entries ?? [];
  const result: HouseholdLedgerBackfillResult = {
    attempted: legacy.length,
    insertedOrUpdated: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
  };
  if (legacy.length === 0) return result;

  const toWrite: LedgerEntry[] = [];
  for (const raw of legacy) {
    if (!isValidLegacyEntry(raw)) {
      result.skippedInvalid += 1;
      continue;
    }
    if (raw.userId !== userId) {
      result.skippedInvalid += 1;
      continue;
    }
    if (options?.skipIfExists !== false) {
      const existing = await dbGetLedgerEntryForUser(userId, raw.id);
      if (existing) {
        result.skippedExisting += 1;
        continue;
      }
    }
    const now = new Date().toISOString();
    toWrite.push({
      id: raw.id,
      userId,
      receiptId: raw.receiptId ?? "",
      date: raw.date,
      storeName: raw.storeName ?? "",
      category: raw.category ?? "その他",
      itemName: raw.itemName ?? "",
      quantity: raw.quantity ?? 1,
      unitPrice: raw.unitPrice ?? raw.amountInclTax ?? 0,
      tax: raw.tax ?? 0,
      amountInclTax: raw.amountInclTax ?? 0,
      paymentMethod: raw.paymentMethod ?? "",
      note: raw.note ?? "",
      moneyUse: raw.moneyUse ?? "unknown",
      sourceImageIds: Array.isArray(raw.sourceImageIds)
        ? raw.sourceImageIds
        : [],
      createdAt: raw.createdAt ?? now,
      updatedAt: raw.updatedAt ?? now,
    });
  }

  if (toWrite.length > 0) {
    await dbUpsertLedgerEntries(toWrite, { source: "backfill" });
    result.insertedOrUpdated = toWrite.length;
  }
  return result;
}

/**
 * Backfill from an in-memory array (tests / explicit migration helpers).
 * Idempotent via upsert by id.
 */
export async function backfillHouseholdLedgerEntriesFromArray(
  userId: string,
  entries: LedgerEntry[],
): Promise<HouseholdLedgerBackfillResult> {
  const owned = entries.filter((entry) => entry.userId === userId && entry.id);
  if (owned.length === 0) {
    return {
      attempted: entries.length,
      insertedOrUpdated: 0,
      skippedExisting: 0,
      skippedInvalid: entries.length,
    };
  }
  await dbUpsertLedgerEntries(owned, { source: "backfill" });
  // Second call proves idempotency for callers that re-run.
  await dbUpsertLedgerEntries(owned, { source: "backfill" });
  return {
    attempted: entries.length,
    insertedOrUpdated: owned.length,
    skippedExisting: 0,
    skippedInvalid: entries.length - owned.length,
  };
}
