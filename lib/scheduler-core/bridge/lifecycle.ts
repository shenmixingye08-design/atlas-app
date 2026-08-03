import type { BridgeLifecycleState } from "./types";

const ORDER: BridgeLifecycleState[] = [
  "Scheduled",
  "OccurrenceCreated",
  "RunCreated",
  "JobCreated",
  "Queued",
  "Leased",
  "Running",
];

export function assertLifecycleTransition(
  from: BridgeLifecycleState,
  to: BridgeLifecycleState,
): boolean {
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  return a >= 0 && b >= 0 && b >= a;
}

export function canTransitionLifecycle(
  from: BridgeLifecycleState,
  to: BridgeLifecycleState,
): boolean {
  return assertLifecycleTransition(from, to);
}

export function nextLifecycle(
  current: BridgeLifecycleState,
): BridgeLifecycleState | null {
  const idx = ORDER.indexOf(current);
  if (idx < 0 || idx >= ORDER.length - 1) return null;
  return ORDER[idx + 1]!;
}

export const BRIDGE_LIFECYCLE_ORDER = ORDER;
export const SCHEDULER_LIFECYCLE_ORDER = ORDER;
