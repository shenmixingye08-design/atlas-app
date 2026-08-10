import type { Automation } from "@/lib/automations/types";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";

import {
  extractV1ShadowId,
  toCanonicalFromV1,
  toCanonicalFromV2,
} from "./normalize";
import type { CanonicalAutomation } from "./types";

/**
 * Merge v1 + v2 into one canonical list.
 * Prefer v2 when a v1 row is only a scheduler shadow / migration source.
 */
export function mergeCanonicalAutomations(input: {
  v1: readonly Automation[];
  v2: readonly AutomationV2[];
}): CanonicalAutomation[] {
  const shadowedV1 = new Set<string>();
  for (const row of input.v2) {
    const shadow = extractV1ShadowId(row);
    if (shadow) shadowedV1.add(shadow);
  }

  const fromV2 = input.v2
    .filter((row) => row.status !== "archived")
    .map(toCanonicalFromV2);

  const fromV1 = input.v1
    .filter((row) => !shadowedV1.has(row.id))
    .map(toCanonicalFromV1);

  return [...fromV2, ...fromV1].sort((a, b) => {
    const aNext = a.nextRunAt ? Date.parse(a.nextRunAt) : Number.POSITIVE_INFINITY;
    const bNext = b.nextRunAt ? Date.parse(b.nextRunAt) : Number.POSITIVE_INFINITY;
    if (aNext !== bNext) return aNext - bNext;
    return a.title.localeCompare(b.title, "ja");
  });
}

/** Resolve which generation owns an `?id=` deep link. Prefer v2. */
export function resolveAutomationIdTarget(
  id: string,
  input: { v1: readonly Automation[]; v2: readonly AutomationV2[] },
): { generation: "v1" | "v2"; id: string } | null {
  const v2 = input.v2.find((row) => row.id === id);
  if (v2) return { generation: "v2", id: v2.id };
  const v1 = input.v1.find((row) => row.id === id);
  if (v1) return { generation: "v1", id: v1.id };
  return null;
}
