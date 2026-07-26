import "server-only";

import { listAiUsageEvents } from "@/lib/billing/usage/store";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import {
  isPaidCapableStatus,
  upsertUserSubscription,
} from "@/lib/billing/subscriptions/service";
import {
  hydrateSubscriptionsFromSupabase,
  listUserSubscriptions,
} from "@/lib/billing/subscriptions/store";
import { listAuditLogEntries } from "@/lib/owner/audit-log";
import { listCostUsageEvents } from "@/lib/owner/cost-ranking/store";

import {
  getOwnerUserAdminRecord,
  isOwnerAccountSuspended,
  setOwnerAccountSuspended,
  type OwnerUserAdminRecord,
} from "./store";

export type OwnerManagedUserRow = {
  userId: string;
  displayName: string;
  registeredAt: string | null;
  planId: string;
  planName: string;
  usageCount: number;
  lastLoginAt: string | null;
  apiCostUsd: number;
  status: "active" | "suspended" | "canceled" | "past_due";
  suspended: boolean;
};

function maskUserId(userId: string): string {
  if (userId.length <= 8) return `${userId.slice(0, 2)}***`;
  return `${userId.slice(0, 6)}…${userId.slice(-4)}`;
}

export async function listOwnerManagedUsers(input?: {
  query?: string;
  planId?: string;
  status?: "active" | "suspended" | "canceled" | "past_due" | "all";
  sort?: "registeredAt" | "usageCount" | "apiCostUsd" | "lastLoginAt";
  order?: "asc" | "desc";
}): Promise<OwnerManagedUserRow[]> {
  await hydrateSubscriptionsFromSupabase();
  const subscriptions = listUserSubscriptions();
  const aiEvents = listAiUsageEvents();
  const audit = listAuditLogEntries();
  const costEvents = listCostUsageEvents();

  const usageByUser = new Map<string, { runs: number; cost: number }>();
  for (const event of aiEvents) {
    const current = usageByUser.get(event.userId) ?? { runs: 0, cost: 0 };
    current.runs += event.requestCount;
    current.cost += event.estimatedCostUsd;
    usageByUser.set(event.userId, current);
  }
  for (const event of costEvents) {
    if (!event.userId) continue;
    const current = usageByUser.get(event.userId) ?? { runs: 0, cost: 0 };
    current.runs += 1;
    current.cost += event.costUsd;
    usageByUser.set(event.userId, current);
  }

  const lastActivity = new Map<string, string>();
  for (const entry of audit) {
    if (!entry.userId) continue;
    const prev = lastActivity.get(entry.userId);
    if (!prev || entry.at > prev) lastActivity.set(entry.userId, entry.at);
  }
  for (const event of aiEvents) {
    const prev = lastActivity.get(event.userId);
    if (!prev || event.timestamp > prev) {
      lastActivity.set(event.userId, event.timestamp);
    }
  }

  const userIds = new Set<string>([
    ...subscriptions.map((row) => row.userId),
    ...usageByUser.keys(),
  ]);

  let rows: OwnerManagedUserRow[] = [...userIds].map((userId) => {
    const sub = subscriptions.find((row) => row.userId === userId);
    const usage = usageByUser.get(userId) ?? { runs: 0, cost: 0 };
    const admin = getOwnerUserAdminRecord(userId);
    const suspended = admin?.suspended === true;
    let status: OwnerManagedUserRow["status"] = "active";
    if (suspended) status = "suspended";
    else if (sub?.status === "canceled") status = "canceled";
    else if (sub?.status === "past_due" || sub?.status === "unpaid") {
      status = "past_due";
    }

    const planId = sub?.planId ?? "free";
    return {
      userId,
      displayName: maskUserId(userId),
      registeredAt: sub?.currentPeriodStart ?? null,
      planId,
      planName: getPlanDefinition(planId as never).name,
      usageCount: usage.runs,
      lastLoginAt: lastActivity.get(userId) ?? null,
      apiCostUsd: Math.round(usage.cost * 100) / 100,
      status,
      suspended,
    };
  });

  const query = input?.query?.trim().toLowerCase();
  if (query) {
    rows = rows.filter(
      (row) =>
        row.userId.toLowerCase().includes(query) ||
        row.displayName.toLowerCase().includes(query) ||
        row.planName.toLowerCase().includes(query),
    );
  }
  if (input?.planId && input.planId !== "all") {
    rows = rows.filter((row) => row.planId === input.planId);
  }
  if (input?.status && input.status !== "all") {
    rows = rows.filter((row) => row.status === input.status);
  }

  const sort = input?.sort ?? "apiCostUsd";
  const order = input?.order ?? "desc";
  rows.sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    const aNum =
      typeof av === "number" ? av : av ? new Date(av).getTime() : 0;
    const bNum =
      typeof bv === "number" ? bv : bv ? new Date(bv).getTime() : 0;
    return order === "asc" ? aNum - bNum : bNum - aNum;
  });

  return rows;
}

export async function setOwnerUserSuspended(input: {
  userId: string;
  suspended: boolean;
  reason?: string | null;
}): Promise<OwnerUserAdminRecord> {
  const record = setOwnerAccountSuspended(input);
  // Also suspend automations so scheduled work stops immediately.
  upsertUserSubscription(input.userId, {
    automationsSuspended: input.suspended,
  });
  return record;
}

export { isOwnerAccountSuspended, isPaidCapableStatus };
