import "server-only";

import { extractV1ShadowId } from "@/lib/automations/canonical/normalize";
import { ensureAutomationsHydrated } from "@/lib/automations/durable";
import { automationService } from "@/lib/automations/automation-service";
import {
  ensureAutomationsV2Hydrated,
  listAutomationsV2FromSot,
} from "@/lib/automation-platform/durable";

import { setAutomationTaskCount } from "./store";

/**
 * Live count of active automations the user currently holds.
 * Official meter: PlanLimits.automationTasks = max active tasks (not monthly runs).
 * V1 scheduler shadows of V2 records are excluded so one job is not counted twice.
 */
export async function countActiveAutomationTasks(
  userId: string,
): Promise<number> {
  await ensureAutomationsHydrated(userId);
  await ensureAutomationsV2Hydrated(userId);

  const v2 = await listAutomationsV2FromSot(userId);
  const v1 = await automationService.listForUser(userId);
  const shadowIds = new Set(
    v2
      .map((row) => extractV1ShadowId(row))
      .filter((id): id is string => Boolean(id)),
  );

  const v2Active = v2.filter((row) => row.status === "active").length;
  const v1Active = v1.filter(
    (row) => row.enabled && !shadowIds.has(row.id),
  ).length;
  return v2Active + v1Active;
}

/** Refresh the usage snapshot cache from live SoT. */
export async function syncAutomationTaskUsage(
  userId: string,
): Promise<number> {
  const count = await countActiveAutomationTasks(userId);
  setAutomationTaskCount(userId, count);
  return count;
}
