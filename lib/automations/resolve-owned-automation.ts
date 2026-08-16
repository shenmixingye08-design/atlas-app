import "server-only";

import {
  ensureAutomationsV2Hydrated,
  getAutomationV2FromSot,
  listAutomationsV2FromSot,
} from "@/lib/automation-platform/durable";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import { executionPolicyFromV1Level } from "@/lib/automation-platform/types/execution-policy";

export { executionPolicyFromV1Level };

/**
 * Resolve a V2 automation the caller owns, accepting:
 * - V2 id
 * - legacy V1 id
 * - v1SchedulerId shadow id
 */
export async function resolveOwnedAutomationV2(
  userId: string,
  id: string,
): Promise<AutomationV2 | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const direct = await getAutomationV2FromSot(trimmed, userId);
  if (direct) return direct;

  await ensureAutomationsV2Hydrated(userId);
  const rows = await listAutomationsV2FromSot(userId);
  return (
    rows.find((row) => {
      if (row.id === trimmed) return true;
      if (row.legacyAutomationId === trimmed) return true;
      const schedulerId = row.instruction.structuredOptions.v1SchedulerId;
      return typeof schedulerId === "string" && schedulerId === trimmed;
    }) ?? null
  );
}
