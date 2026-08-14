import type { PlanId } from "@/lib/billing/plans/types";

import { usageLevelRank } from "./levels";
import type { UsageMeterId, UsageWarningLevel } from "./types";

export const USAGE_THRESHOLD_STORAGE_KEY = "atlas-usage-threshold-notices";

export type UsageThresholdMemoryKey = {
  month: string;
  planId: PlanId;
  meterId: UsageMeterId;
};

export function usageThresholdMemoryId(input: UsageThresholdMemoryKey): string {
  return `${input.month}:${input.planId}:${input.meterId}`;
}

export function shouldNotifyUsageThreshold(input: {
  current: UsageWarningLevel;
  lastNotified: UsageWarningLevel | null;
}): boolean {
  if (input.current === "normal") return false;
  if (!input.lastNotified) return true;
  return usageLevelRank(input.current) > usageLevelRank(input.lastNotified);
}

export function readUsageThresholdMemory(
  storage: Pick<Storage, "getItem"> | null,
): Record<string, UsageWarningLevel> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(USAGE_THRESHOLD_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, UsageWarningLevel>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeUsageThresholdMemory(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  next: Record<string, UsageWarningLevel>,
): void {
  if (!storage) return;
  try {
    storage.setItem(USAGE_THRESHOLD_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode.
  }
}

export function recordUsageThresholdNotice(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  key: UsageThresholdMemoryKey,
  level: UsageWarningLevel,
): void {
  const memory = readUsageThresholdMemory(storage);
  memory[usageThresholdMemoryId(key)] = level;
  writeUsageThresholdMemory(storage, memory);
}

export function takeUsageThresholdNotices<T extends { id: UsageMeterId; level: UsageWarningLevel }>(
  items: readonly T[],
  key: Omit<UsageThresholdMemoryKey, "meterId">,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): T[] {
  const memory = readUsageThresholdMemory(storage);
  const due: T[] = [];
  for (const item of items) {
    if (item.level === "normal") continue;
    const id = usageThresholdMemoryId({ ...key, meterId: item.id });
    if (!shouldNotifyUsageThreshold({ current: item.level, lastNotified: memory[id] ?? null })) {
      continue;
    }
    memory[id] = item.level;
    due.push(item);
  }
  writeUsageThresholdMemory(storage, memory);
  return due;
}
