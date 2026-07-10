import "server-only";

import { buildCostRankingSnapshot } from "./engine";
import type { CostRankingSnapshot } from "./types";

export function getCostRankingSnapshot(
  now: Date = new Date(),
): CostRankingSnapshot {
  return buildCostRankingSnapshot(now);
}
