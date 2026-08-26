/**
 * Deterministic cleanup for N-08 health-probe automations.
 * Probe identities never share a real user's plan slot; leftovers are still
 * removed so Production does not accumulate orphaned probe rows.
 */

import "server-only";

import { isInternalProbeIdentity } from "@/lib/health/internal-probe-user";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { releaseAutomationCreateSlot } from "@/lib/billing/usage/automation-slots";

export const N08_PROBE_USER_PREFIX = "n08_probe_";

export type N08ProbeCleanupResult = {
  automationDeleted: number;
  slotsReleased: number;
  orphanDetected: number;
  cleanupSuccess: boolean;
};

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function countN08ProbeSlots(): Promise<number> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const { listBillableAutomationIds } = await import(
      "@/lib/billing/usage/automation-inventory"
    );
    const { listAutomationOwnerUserIds } = await import(
      "@/lib/automations/global-durable"
    );
    const owners = (await listAutomationOwnerUserIds()).filter((id) =>
      isInternalProbeIdentity(id),
    );
    let total = 0;
    for (const owner of owners) {
      total += (await listBillableAutomationIds(owner)).length;
    }
    return total;
  }

  const { count, error } = await client
    .from("atlas_billing_automation_slots")
    .select("automation_id", { count: "exact", head: true })
    .like("user_id", `${N08_PROBE_USER_PREFIX}%`);
  if (error) {
    return countN08ProbeAutomations(client);
  }
  return asCount(count);
}

async function countN08ProbeAutomations(
  client: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
): Promise<number> {
  const v1 = await client
    .from("atlas_automation_definitions")
    .select("id", { count: "exact", head: true })
    .like("owner_user_id", `${N08_PROBE_USER_PREFIX}%`)
    .is("deleted_at", null);
  const v2 = await client
    .from("atlas_automations")
    .select("id", { count: "exact", head: true })
    .like("user_id", `${N08_PROBE_USER_PREFIX}%`)
    .neq("status", "archived");
  return asCount(v1.count) + asCount(v2.count);
}

async function deleteLike(
  table: string,
  column: string,
  prefix: string,
): Promise<number> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return 0;
  const { data, error } = await client
    .from(table)
    .delete()
    .like(column, `${prefix}%`)
    .select("id");
  if (error || !Array.isArray(data)) return 0;
  return data.length;
}

export async function sweepN08ProbeOrphans(): Promise<N08ProbeCleanupResult> {
  let automationDeleted = 0;
  let slotsReleased = 0;
  let orphanDetected = 0;
  let cleanupSuccess = true;

  try {
    orphanDetected = await countN08ProbeSlots();

    const v1Deleted = await deleteLike(
      "atlas_automation_definitions",
      "owner_user_id",
      N08_PROBE_USER_PREFIX,
    );
    const v2Deleted = await deleteLike(
      "atlas_automations",
      "user_id",
      N08_PROBE_USER_PREFIX,
    );
    automationDeleted = v1Deleted + v2Deleted;

    const client = createServiceRoleClientIfConfigured();
    if (client) {
      const slots = await client
        .from("atlas_billing_automation_slots")
        .delete()
        .like("user_id", `${N08_PROBE_USER_PREFIX}%`)
        .select("automation_id");
      if (!slots.error && Array.isArray(slots.data)) {
        slotsReleased = slots.data.length;
        for (const row of slots.data) {
          const id =
            row && typeof row === "object" && "automation_id" in row
              ? String((row as { automation_id?: string }).automation_id ?? "")
              : "";
          if (id) {
            await releaseAutomationCreateSlot(id).catch(() => undefined);
          }
        }
      }
      await client
        .from("atlas_user_state")
        .delete()
        .like("user_id", `${N08_PROBE_USER_PREFIX}%`);
    }

    cleanupSuccess = (await countN08ProbeSlots()) === 0;
  } catch {
    cleanupSuccess = false;
  }

  return {
    automationDeleted,
    slotsReleased,
    orphanDetected,
    cleanupSuccess,
  };
}

export async function cleanupN08ProbeOwners(input: {
  ownerIds: readonly string[];
  automationIds: readonly string[];
}): Promise<N08ProbeCleanupResult> {
  let automationDeleted = 0;
  let slotsReleased = 0;
  const safeOwners = input.ownerIds.filter((id) => isInternalProbeIdentity(id));
  const safeAutomationIds = input.automationIds.filter((id) => id.trim());

  try {
    const { automationService } = await import(
      "@/lib/automations/automation-service"
    );
    const { automationPlatformService } = await import(
      "@/lib/automation-platform/service/automation-service"
    );
    const ownerContext = {
      email: "n08-probe@atlas.test",
      isOwner: false,
      isBetaUser: false,
    };

    for (const ownerId of safeOwners) {
      for (const automationId of safeAutomationIds) {
        try {
          const deleted = await automationService.deleteForUser(
            automationId,
            ownerId,
          );
          if (deleted) automationDeleted += 1;
        } catch {
          /* continue — DB sweep below is the crash-safe path */
        }
        try {
          await automationPlatformService.archive(
            ownerId,
            automationId,
            ownerContext,
          );
          automationDeleted += 1;
        } catch {
          /* archived or never created */
        }
        await releaseAutomationCreateSlot(automationId).catch(() => undefined);
        slotsReleased += 1;
      }
    }
  } catch {
    /* fall through to sweep */
  }

  const swept = await sweepN08ProbeOrphans();
  return {
    automationDeleted: automationDeleted + swept.automationDeleted,
    slotsReleased: slotsReleased + swept.slotsReleased,
    orphanDetected: swept.orphanDetected,
    cleanupSuccess: swept.cleanupSuccess,
  };
}
