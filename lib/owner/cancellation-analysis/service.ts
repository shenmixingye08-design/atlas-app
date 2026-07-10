import "server-only";

import { buildCancellationAnalysisSnapshot } from "./engine";
import type { CancellationAnalysisSnapshot } from "./types";

export function getCancellationAnalysisSnapshot(
  now: Date = new Date(),
): CancellationAnalysisSnapshot {
  return buildCancellationAnalysisSnapshot(now);
}
