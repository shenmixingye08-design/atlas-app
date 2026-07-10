import "server-only";

import { buildPopularityRankingSnapshot } from "./engine";

export function getPopularityRankingSnapshot(now?: Date) {
  return buildPopularityRankingSnapshot(now);
}
