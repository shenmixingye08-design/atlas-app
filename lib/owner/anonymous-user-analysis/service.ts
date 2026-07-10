import "server-only";

import { buildAnonymousUserAnalysisSnapshot } from "./engine";
import type { AnonymousUserAnalysisSnapshot } from "./types";

export function getAnonymousUserAnalysisSnapshot(
  now: Date = new Date(),
): AnonymousUserAnalysisSnapshot {
  return buildAnonymousUserAnalysisSnapshot(now);
}
