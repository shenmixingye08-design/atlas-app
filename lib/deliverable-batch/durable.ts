import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import {
  listDeliverableBatches,
  listDeliverableBatchItems,
  replaceUserDeliverableBatches,
} from "./store";
import { loadDeliverableBatchRows } from "./table";
import type { DeliverableBatch, DeliverableBatchItem } from "./types";

export const DELIVERABLE_BATCH_DOMAIN_KEY = "atlasDeliverableBatches";

export type DurableDeliverableBatchState = {
  batches: DeliverableBatch[];
  items: DeliverableBatchItem[];
};

const hydrated = new Set<string>();

export async function persistDeliverableBatchesNow(userId: string): Promise<void> {
  const batches = listDeliverableBatches(userId);
  const items = batches.flatMap((batch) =>
    listDeliverableBatchItems(userId, batch.id),
  );
  await persistDurableDomain(
    userId,
    DELIVERABLE_BATCH_DOMAIN_KEY,
    { batches, items } satisfies DurableDeliverableBatchState,
    {
      compact: (state) => ({
        batches: (state.batches ?? []).slice(0, 40),
        items: (state.items ?? []).slice(0, 400),
      }),
      forceSupabase: true,
    },
  );
}

export async function ensureDeliverableBatchesHydrated(
  userId: string,
): Promise<void> {
  if (hydrated.has(userId)) return;
  const fromTable = await loadDeliverableBatchRows(userId).catch(() => null);
  if (fromTable?.batches.length) {
    replaceUserDeliverableBatches(
      userId,
      fromTable.batches.filter((batch) => batch.userId === userId),
      fromTable.items.filter((item) => item.userId === userId),
    );
    hydrated.add(userId);
    return;
  }
  const loaded = await loadDurableDomain<DurableDeliverableBatchState>(
    userId,
    DELIVERABLE_BATCH_DOMAIN_KEY,
  );
  if (loaded?.batches?.length) {
    replaceUserDeliverableBatches(
      userId,
      loaded.batches.filter((batch) => batch.userId === userId),
      (loaded.items ?? []).filter((item) => item.userId === userId),
    );
  }
  hydrated.add(userId);
}

export function resetDeliverableBatchHydrationForTests(): void {
  hydrated.clear();
}
