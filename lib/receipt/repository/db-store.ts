/**
 * P1-05: Household ledger DB Single Source of Truth.
 * Process memory is cache only — never the durable SoT for entries.
 */

import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type {
  LedgerEntry,
  MoneyUse,
  ReceiptCategory,
} from "@/lib/receipt/types";

import { HOUSEHOLD_LEDGER_TABLE } from "./migration-sql";
import {
  isHouseholdLedgerTableReady,
  markHouseholdLedgerTableReadyUnknown,
  setHouseholdLedgerTableReadyForTests,
} from "./table-ready";

export type LedgerEntrySource = "receipt" | "manual" | "backfill" | "legacy";

export type LedgerListOptions = {
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
};

type LedgerRow = {
  id: string;
  user_id: string;
  amount: number | string;
  currency: string;
  occurred_at: string;
  occurred_on: string;
  category: string;
  merchant: string;
  item_name: string;
  description: string;
  source: string;
  receipt_id: string | null;
  source_image_ids: unknown;
  quantity: number | string | null;
  unit_price: number | string | null;
  tax: number | string | null;
  payment_method: string | null;
  money_use: string | null;
  created_at: string;
  updated_at: string;
};

type LocalDb = {
  entries: Map<string, LedgerEntry & { source: LedgerEntrySource; currency: string }>;
};

function getLocalDb(): LocalDb {
  const scope = globalThis as typeof globalThis & {
    __atlasHouseholdLedgerDbSotLocal?: LocalDb;
  };
  if (!scope.__atlasHouseholdLedgerDbSotLocal) {
    scope.__atlasHouseholdLedgerDbSotLocal = {
      entries: new Map(),
    };
  }
  return scope.__atlasHouseholdLedgerDbSotLocal;
}

function forceMemory(): boolean {
  return (
    process.env.ATLAS_HOUSEHOLD_LEDGER_FORCE_MEMORY?.trim().toLowerCase() ===
    "true"
  );
}

export function resetHouseholdLedgerDbStoreForTests(): void {
  getLocalDb().entries.clear();
  setHouseholdLedgerTableReadyForTests(true);
}

function isMissingError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table|column /i.test(
        message,
      ),
  );
}

function num(value: number | string | null | undefined, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dateOnly(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(isoOrDate)) return isoOrDate.slice(0, 10);
  const parsed = Date.parse(isoOrDate);
  if (!Number.isFinite(parsed)) {
    return new Date().toISOString().slice(0, 10);
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function occurredAtFromDate(date: string): string {
  const day = dateOnly(date);
  return `${day}T00:00:00.000Z`;
}

function asSource(value: string | undefined): LedgerEntrySource {
  if (
    value === "receipt" ||
    value === "manual" ||
    value === "backfill" ||
    value === "legacy"
  ) {
    return value;
  }
  return "receipt";
}

export function toLedgerRow(
  entry: LedgerEntry,
  source: LedgerEntrySource = "receipt",
  currency = "JPY",
): LedgerRow {
  const occurredOn = dateOnly(entry.date);
  return {
    id: entry.id,
    user_id: entry.userId,
    amount: entry.amountInclTax,
    currency,
    occurred_at: occurredAtFromDate(occurredOn),
    occurred_on: occurredOn,
    category: entry.category,
    merchant: entry.storeName,
    item_name: entry.itemName,
    description: entry.note ?? "",
    source,
    receipt_id: entry.receiptId || null,
    source_image_ids: entry.sourceImageIds ?? [],
    quantity: entry.quantity,
    unit_price: entry.unitPrice,
    tax: entry.tax,
    payment_method: entry.paymentMethod || null,
    money_use: entry.moneyUse || null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export function fromLedgerRow(row: LedgerRow): LedgerEntry {
  const images = Array.isArray(row.source_image_ids)
    ? (row.source_image_ids as string[])
    : [];
  return {
    id: row.id,
    userId: row.user_id,
    receiptId: row.receipt_id ?? "",
    date: dateOnly(row.occurred_on || row.occurred_at),
    storeName: row.merchant ?? "",
    category: (row.category as ReceiptCategory) || "その他",
    itemName: row.item_name ?? "",
    quantity: num(row.quantity, 1),
    unitPrice: num(row.unit_price),
    tax: num(row.tax),
    amountInclTax: num(row.amount),
    paymentMethod: row.payment_method ?? "",
    note: row.description ?? "",
    moneyUse: (row.money_use as MoneyUse) || "unknown",
    sourceImageIds: images,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function shouldUseLocalStandIn(): Promise<boolean> {
  if (forceMemory() && !isAtlasProduction()) return true;
  if (isAtlasProduction()) return false;
  const ready = await isHouseholdLedgerTableReady();
  if (ready && createServiceRoleClientIfConfigured()) return false;
  setHouseholdLedgerTableReadyForTests(true);
  return true;
}

function filterLocal(
  userId: string,
  options?: LedgerListOptions,
): LedgerEntry[] {
  let rows = [...getLocalDb().entries.values()].filter(
    (row) => row.userId === userId,
  );
  if (options?.fromDate) {
    const from = dateOnly(options.fromDate);
    rows = rows.filter((row) => row.date >= from);
  }
  if (options?.toDate) {
    const to = dateOnly(options.toDate);
    rows = rows.filter((row) => row.date <= to);
  }
  rows.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = options?.limit;
  if (limit != null && limit >= 0) {
    return rows.slice(offset, offset + limit).map((row) => structuredClone(row));
  }
  return rows.slice(offset).map((row) => structuredClone(row));
}

export async function dbUpsertLedgerEntries(
  entries: LedgerEntry[],
  options?: { source?: LedgerEntrySource; currency?: string },
): Promise<LedgerEntry[]> {
  if (entries.length === 0) return [];
  const source = options?.source ?? "receipt";
  const currency = options?.currency ?? "JPY";

  for (const entry of entries) {
    if (!entry.id || !entry.userId) {
      throw new Error("[household-ledger] entry id/userId required");
    }
  }

  if (await shouldUseLocalStandIn()) {
    const db = getLocalDb();
    for (const entry of entries) {
      db.entries.set(entry.id, {
        ...structuredClone(entry),
        source,
        currency,
      });
    }
    return entries.map((entry) => structuredClone(entry));
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[household-ledger] DB SoT unavailable (no service role)");
    }
    const db = getLocalDb();
    for (const entry of entries) {
      db.entries.set(entry.id, {
        ...structuredClone(entry),
        source,
        currency,
      });
    }
    return entries.map((entry) => structuredClone(entry));
  }

  const rows = entries.map((entry) => toLedgerRow(entry, source, currency));
  const { error } = await client
    .from(HOUSEHOLD_LEDGER_TABLE)
    .upsert(rows, { onConflict: "id" });
  if (error) {
    if (isMissingError(error.message)) {
      markHouseholdLedgerTableReadyUnknown();
      if (isAtlasProduction()) {
        throw new Error(
          `[household-ledger] table missing: ${error.message}`,
        );
      }
      const db = getLocalDb();
      for (const entry of entries) {
        db.entries.set(entry.id, {
          ...structuredClone(entry),
          source,
          currency,
        });
      }
      return entries.map((entry) => structuredClone(entry));
    }
    throw new Error(
      `[household-ledger] upsert failed: ${error.message}`,
    );
  }
  return entries.map((entry) => structuredClone(entry));
}

export async function dbListLedgerEntries(
  userId: string,
  options?: LedgerListOptions,
): Promise<LedgerEntry[]> {
  if (await shouldUseLocalStandIn()) {
    return filterLocal(userId, options);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return filterLocal(userId, options);
  }

  let query = client
    .from(HOUSEHOLD_LEDGER_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false });

  if (options?.fromDate) {
    query = query.gte("occurred_on", dateOnly(options.fromDate));
  }
  if (options?.toDate) {
    query = query.lte("occurred_on", dateOnly(options.toDate));
  }
  if (options?.offset != null && options.offset > 0) {
    const limit = options.limit ?? 1000;
    query = query.range(options.offset, options.offset + limit - 1);
  } else if (options?.limit != null) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingError(error.message)) {
      markHouseholdLedgerTableReadyUnknown();
      return filterLocal(userId, options);
    }
    throw new Error(`[household-ledger] list failed: ${error.message}`);
  }
  return (data as LedgerRow[] | null)?.map(fromLedgerRow) ?? [];
}

export async function dbGetLedgerEntryForUser(
  userId: string,
  entryId: string,
): Promise<LedgerEntry | null> {
  if (await shouldUseLocalStandIn()) {
    const row = getLocalDb().entries.get(entryId);
    if (!row || row.userId !== userId) return null;
    return structuredClone(row);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const row = getLocalDb().entries.get(entryId);
    if (!row || row.userId !== userId) return null;
    return structuredClone(row);
  }

  const { data, error } = await client
    .from(HOUSEHOLD_LEDGER_TABLE)
    .select("*")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingError(error.message)) {
      markHouseholdLedgerTableReadyUnknown();
      return null;
    }
    throw new Error(`[household-ledger] get failed: ${error.message}`);
  }
  return data ? fromLedgerRow(data as LedgerRow) : null;
}

export async function dbUpdateLedgerEntryForUser(
  userId: string,
  entryId: string,
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
  >,
): Promise<LedgerEntry | null> {
  const current = await dbGetLedgerEntryForUser(userId, entryId);
  if (!current) return null;
  if (current.userId !== userId) return null;

  const updated: LedgerEntry = {
    ...current,
    ...patch,
    id: current.id,
    userId: current.userId,
    updatedAt: new Date().toISOString(),
  };

  await dbUpsertLedgerEntries([updated], {
    source: current.receiptId ? "receipt" : "manual",
  });
  return updated;
}

export async function dbDeleteLedgerEntryForUser(
  userId: string,
  entryId: string,
): Promise<boolean> {
  if (await shouldUseLocalStandIn()) {
    const row = getLocalDb().entries.get(entryId);
    if (!row || row.userId !== userId) return false;
    getLocalDb().entries.delete(entryId);
    return true;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const row = getLocalDb().entries.get(entryId);
    if (!row || row.userId !== userId) return false;
    getLocalDb().entries.delete(entryId);
    return true;
  }

  const { data, error } = await client
    .from(HOUSEHOLD_LEDGER_TABLE)
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    if (isMissingError(error.message)) {
      markHouseholdLedgerTableReadyUnknown();
      if (isAtlasProduction()) {
        throw new Error(
          `[household-ledger] delete failed (table missing): ${error.message}`,
        );
      }
      return false;
    }
    throw new Error(`[household-ledger] delete failed: ${error.message}`);
  }
  return Array.isArray(data) && data.length > 0;
}

/** Count entries for a user (used by integrity tests / probes). */
export async function dbCountLedgerEntries(userId: string): Promise<number> {
  if (await shouldUseLocalStandIn()) {
    return [...getLocalDb().entries.values()].filter(
      (row) => row.userId === userId,
    ).length;
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return [...getLocalDb().entries.values()].filter(
      (row) => row.userId === userId,
    ).length;
  }
  const { count, error } = await client
    .from(HOUSEHOLD_LEDGER_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    if (isMissingError(error.message)) {
      markHouseholdLedgerTableReadyUnknown();
      return 0;
    }
    throw new Error(`[household-ledger] count failed: ${error.message}`);
  }
  return count ?? 0;
}

export function inferEntrySource(entry: LedgerEntry): LedgerEntrySource {
  if (entry.receiptId) return "receipt";
  return "manual";
}

export { asSource };
