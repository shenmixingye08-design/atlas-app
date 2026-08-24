import "server-only";

import { ensureRevenueMaxHydrated, persistRevenueMax } from "./durable";
import { applyValueTouch } from "./record";

export async function touchRevenueMaxValue(
  userId: string,
  summary?: string | null,
): Promise<void> {
  await ensureRevenueMaxHydrated(userId);
  applyValueTouch(userId, summary);
  await persistRevenueMax(userId);
}
