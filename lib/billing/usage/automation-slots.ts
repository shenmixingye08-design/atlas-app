/**
 * Atomic automation slot reservation.
 * Inventory (non-archived) is the product SoT; slots serialize concurrent creates.
 */

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { listBillableAutomationIds } from "./automation-inventory";
import { asUntypedSupabase } from "./untyped-supabase";

export type AutomationSlotResult =
  | { ok: true; used: number; limit: number; idempotent: boolean }
  | { ok: false; used: number; limit: number; reason: "limit_reached" | "usage_unavailable" };

type MemorySlot = { userId: string; automationId: string };

function memorySlots(): Map<string, MemorySlot> {
  const scope = globalThis as typeof globalThis & {
    __atlasAutomationSlots?: Map<string, MemorySlot>;
  };
  if (!scope.__atlasAutomationSlots) {
    scope.__atlasAutomationSlots = new Map();
  }
  return scope.__atlasAutomationSlots;
}

const lockTails = new Map<string, Promise<void>>();

async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = lockTails.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  lockTails.set(userId, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (lockTails.get(userId) === next) {
      lockTails.delete(userId);
    }
  }
}

function slotsForUser(userId: string): MemorySlot[] {
  return [...memorySlots().values()].filter((slot) => slot.userId === userId);
}

async function seedMemorySlots(userId: string): Promise<void> {
  const ids = await listBillableAutomationIds(userId);
  const slots = memorySlots();
  for (const [automationId, slot] of slots) {
    if (slot.userId === userId && !ids.includes(automationId)) {
      slots.delete(automationId);
    }
  }
  for (const id of ids) {
    if (!slots.has(id)) {
      slots.set(id, { userId, automationId: id });
    }
  }
}

async function reserveInSupabase(input: {
  userId: string;
  automationId: string;
  limit: number;
}): Promise<AutomationSlotResult | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  const existingIds = await listBillableAutomationIds(input.userId);
  const supabase = asUntypedSupabase(client);
  for (const id of existingIds) {
    await supabase.rpc("atlas_reserve_automation_slot", {
      p_user_id: input.userId,
      p_automation_id: id,
      p_limit: Math.max(input.limit, existingIds.length),
    });
  }

  const { data, error } = await supabase.rpc("atlas_reserve_automation_slot", {
    p_user_id: input.userId,
    p_automation_id: input.automationId,
    p_limit: input.limit,
  });
  if (error || !data || typeof data !== "object") {
    return null;
  }
  const row = data as {
    ok?: boolean;
    used?: number;
    limit?: number;
    idempotent?: boolean;
  };
  const used = typeof row.used === "number" ? row.used : existingIds.length;
  if (row.ok) {
    return {
      ok: true,
      used,
      limit: input.limit,
      idempotent: Boolean(row.idempotent),
    };
  }
  return {
    ok: false,
    used,
    limit: input.limit,
    reason: "limit_reached",
  };
}

export async function reserveAutomationCreateSlot(input: {
  userId: string;
  automationId: string;
  limit: number;
}): Promise<AutomationSlotResult> {
  if (!input.userId.trim() || !input.automationId.trim()) {
    return {
      ok: false,
      used: 0,
      limit: input.limit,
      reason: "usage_unavailable",
    };
  }

  return withUserLock(input.userId, async () => {
    const durable = await reserveInSupabase(input);
    if (durable) return durable;
    if (isAtlasProduction()) {
      return {
        ok: false,
        used: 0,
        limit: input.limit,
        reason: "usage_unavailable",
      };
    }

    await seedMemorySlots(input.userId);
    const slots = memorySlots();
    const existing = slots.get(input.automationId);
    if (existing && existing.userId === input.userId) {
      return {
        ok: true,
        used: slotsForUser(input.userId).length,
        limit: input.limit,
        idempotent: true,
      };
    }
    const used = slotsForUser(input.userId).length;
    if (used >= input.limit) {
      return {
        ok: false,
        used,
        limit: input.limit,
        reason: "limit_reached",
      };
    }
    slots.set(input.automationId, {
      userId: input.userId,
      automationId: input.automationId,
    });
    return {
      ok: true,
      used: used + 1,
      limit: input.limit,
      idempotent: false,
    };
  });
}

export async function releaseAutomationCreateSlot(
  automationId: string,
): Promise<void> {
  const id = automationId.trim();
  if (!id) return;
  memorySlots().delete(id);
  const client = createServiceRoleClientIfConfigured();
  if (!client) return;
  await asUntypedSupabase(client).rpc("atlas_release_automation_slot", {
    p_automation_id: id,
  });
}

export function resetAutomationSlotsForTests(): void {
  memorySlots().clear();
  lockTails.clear();
}
