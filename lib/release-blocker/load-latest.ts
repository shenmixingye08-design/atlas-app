import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  DEFAULT_RELEASE_BLOCKER_OUT,
  type ReleaseBlockerAggregate,
} from "@/lib/release-blocker/types";

export type LatestReleaseBlocker = {
  suiteId: string;
  reportPath?: string;
  releaseReady: boolean;
  authzFixed: boolean;
  billingGated: boolean;
  criticalOpen: number;
  aggregate?: ReleaseBlockerAggregate;
};

export function loadLatestReleaseBlocker(
  root = DEFAULT_RELEASE_BLOCKER_OUT
): LatestReleaseBlocker | null {
  const latestPath = join(root, "latest.json");
  if (!existsSync(latestPath)) return null;
  try {
    const latest = JSON.parse(
      readFileSync(latestPath, "utf8")
    ) as LatestReleaseBlocker;
    if (latest.suiteId) {
      const aggPath = join(root, latest.suiteId, "aggregate.json");
      if (existsSync(aggPath)) {
        latest.aggregate = JSON.parse(
          readFileSync(aggPath, "utf8")
        ) as ReleaseBlockerAggregate;
      }
    }
    return latest;
  } catch {
    return null;
  }
}
