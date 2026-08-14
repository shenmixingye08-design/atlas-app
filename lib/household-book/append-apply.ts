import "server-only";

import { toLedgerEntries } from "@/lib/household-book/append";
import type { HouseholdBookDocument } from "@/lib/household-book/types";
import { ensureHouseholdLedgerHydrated } from "@/lib/receipt/durable";
import { upsertLedgerEntries } from "@/lib/receipt/store";

export async function appendHouseholdBookToLedger(
  userId: string,
  book: HouseholdBookDocument,
): Promise<number> {
  if (!book.appendable) return 0;
  const entries = toLedgerEntries(userId, book);
  if (entries.length === 0) return 0;
  await ensureHouseholdLedgerHydrated(userId);
  await upsertLedgerEntries(userId, entries);
  return entries.length;
}
