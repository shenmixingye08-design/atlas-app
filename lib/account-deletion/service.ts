import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { getStripeClient } from "@/lib/billing/stripe/client";
import { suspendAutomationsForUser } from "@/lib/billing/subscriptions/lifecycle";
import {
  cancelSubscriptionAtPeriodEnd,
  getUserSubscriptionView,
  resolveUserSubscription,
} from "@/lib/billing/subscriptions/service";
import { automationService } from "@/lib/automations/automation-service";
import { unregisterAutomationUserIdIfEmpty } from "@/lib/automations/global-durable";
import { serverAutomationRepository } from "@/lib/automations/repositories/server-automation-repository";
import { schedulePersistAutomations } from "@/lib/automations/durable";
import { clearCommanderRunsForUser } from "@/lib/commander/run-store";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import { disconnectLineForUser } from "@/lib/integrations/line/service";
import { resetLearningStores } from "@/lib/learning-engine/service";
import {
  updateUserNotificationPreferences,
} from "@/lib/notifications/service";
import { replaceUserNotifications } from "@/lib/notifications/store";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { resetUserMemories } from "@/lib/user-memory/service";
import { resetWorkMemories } from "@/lib/work-memory/service";
import { PROJECTS_TABLE } from "@/lib/projects/repositories/project-row";

import {
  ensureAccountDeletionHydrated,
  listScheduledAccountDeletions,
  schedulePersistAccountDeletion,
  wipeUserDurableDomains,
} from "./durable";
import {
  deleteAccountDeletionRecord,
  getAccountDeletionRecord,
  saveAccountDeletionRecord,
} from "./store";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_RETENTION_DAYS,
  type AccountDeletionOwnerRow,
  type AccountDeletionRecord,
} from "./types";

const DISCONNECT_SERVICES: ExternalServiceId[] = [
  "google",
  "dropbox",
  "x",
  "wordpress",
  "youtube",
  "notion",
];

function addRetentionDays(from: Date, days: number): string {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function daysRemaining(deleteAfter: string, now = new Date()): number {
  const ms = new Date(deleteAfter).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

async function cancelStripeIfNeeded(userId: string): Promise<boolean> {
  const subscription = resolveUserSubscription(userId);
  if (!subscription.stripeSubscriptionId) {
    return true;
  }

  const stripe = getStripeClient();
  if (stripe) {
    try {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      console.error("[account-deletion] Stripe cancel failed:", error);
      // Still mark local cancel-at-period-end so withdrawal proceeds.
    }
  }

  cancelSubscriptionAtPeriodEnd(userId);
  return true;
}

async function stopAutomations(userId: string): Promise<boolean> {
  suspendAutomationsForUser(userId);
  const rows = await automationService.listForUser(userId);
  for (const row of rows) {
    if (row.enabled) {
      await automationService.setEnabledForUser(row.id, userId, false);
    }
  }
  schedulePersistAutomations(userId);
  await unregisterAutomationUserIdIfEmpty(userId);
  return true;
}

function stopNotifications(userId: string): boolean {
  updateUserNotificationPreferences(userId, {
    allEnabled: false,
    channels: {
      inApp: false,
      email: false,
      line: false,
      slack: false,
      push: false,
    },
  });
  replaceUserNotifications(userId, []);
  return true;
}

async function disconnectIntegrations(userId: string): Promise<boolean> {
  for (const serviceId of DISCONNECT_SERVICES) {
    try {
      await externalServiceManager.disconnect(userId, serviceId);
    } catch (error) {
      console.warn(
        `[account-deletion] disconnect ${serviceId} skipped:`,
        error,
      );
    }
  }
  try {
    await disconnectLineForUser(userId);
  } catch (error) {
    console.warn("[account-deletion] LINE disconnect skipped:", error);
  }
  return true;
}

async function deleteSupabaseProjects(userId: string): Promise<void> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return;
  try {
    await client.from(PROJECTS_TABLE).delete().eq("user_id", userId);
  } catch (error) {
    console.warn("[account-deletion] projects delete skipped:", error);
  }
}

async function deleteClerkUser(userId: string): Promise<boolean> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return false;
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
    return true;
  } catch (error) {
    console.error("[account-deletion] Clerk deleteUser failed:", error);
    return false;
  }
}

/**
 * Soft withdrawal: Stripe cancel → stop automations → stop notifications →
 * disconnect integrations → schedule purge after 30 days.
 */
export async function requestAccountWithdrawal(
  userId: string,
): Promise<AccountDeletionRecord> {
  await ensureAccountDeletionHydrated(userId);
  const existing = getAccountDeletionRecord(userId);
  if (existing?.status === "scheduled") {
    return existing;
  }

  const view = getUserSubscriptionView(userId);
  const email = await getClerkUserPrimaryEmail(userId);
  const now = new Date();

  const stripeCanceled = await cancelStripeIfNeeded(userId);
  const automationsStopped = await stopAutomations(userId);
  const notificationsStopped = stopNotifications(userId);
  const integrationsDisconnected = await disconnectIntegrations(userId);

  const record: AccountDeletionRecord = {
    userId,
    email,
    planId: view.planId,
    planName: view.planName,
    wasPaid: view.isPaid,
    status: "scheduled",
    requestedAt: now.toISOString(),
    deleteAfter: addRetentionDays(now, ACCOUNT_DELETION_RETENTION_DAYS),
    canceledAt: null,
    purgedAt: null,
    steps: {
      stripeCanceled,
      automationsStopped,
      notificationsStopped,
      integrationsDisconnected,
    },
    updatedAt: now.toISOString(),
  };

  schedulePersistAccountDeletion(record);
  return record;
}

export async function cancelAccountDeletion(
  userId: string,
): Promise<AccountDeletionRecord | null> {
  await ensureAccountDeletionHydrated(userId);
  const existing = getAccountDeletionRecord(userId);
  if (!existing || existing.status !== "scheduled") {
    return existing;
  }

  const now = new Date().toISOString();
  const next: AccountDeletionRecord = {
    ...existing,
    status: "canceled",
    canceledAt: now,
    updatedAt: now,
  };
  schedulePersistAccountDeletion(next);
  return next;
}

/**
 * Hard purge. Requires confirmation === "DELETE".
 * Does not wipe billing history (atlasBilling / Stripe records retained).
 */
export async function purgeAccount(
  userId: string,
  confirmation: string,
  options?: { force?: boolean },
): Promise<AccountDeletionRecord> {
  if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
    throw new Error('確認のため "DELETE" と入力してください');
  }

  await ensureAccountDeletionHydrated(userId);
  const existing = getAccountDeletionRecord(userId);
  const now = new Date();

  if (!options?.force) {
    if (!existing || existing.status !== "scheduled") {
      throw new Error("退会予約がありません。先に退会手続きを行ってください");
    }
  } else if (existing && existing.status === "scheduled") {
    if (new Date(existing.deleteAfter).getTime() > now.getTime()) {
      // Owner force may still purge; cron only calls force on due rows.
    }
  }

  // In-memory / domain resets (billing history excluded).
  await stopAutomations(userId);
  stopNotifications(userId);
  await disconnectIntegrations(userId);
  resetWorkMemories(userId);
  resetLearningStores(userId);
  resetUserMemories(userId);
  clearCommanderRunsForUser(userId);
  await serverAutomationRepository.replaceUserAutomations(userId, []);
  schedulePersistAutomations(userId);
  await unregisterAutomationUserIdIfEmpty(userId);
  await deleteSupabaseProjects(userId);
  await wipeUserDurableDomains(userId);

  const purged: AccountDeletionRecord = {
    userId,
    email: existing?.email ?? (await getClerkUserPrimaryEmail(userId)),
    planId: existing?.planId ?? "free",
    planName: existing?.planName ?? getPlanDefinition("free").name,
    wasPaid: existing?.wasPaid ?? false,
    status: "purged",
    requestedAt: existing?.requestedAt ?? now.toISOString(),
    deleteAfter: existing?.deleteAfter ?? now.toISOString(),
    canceledAt: existing?.canceledAt ?? null,
    purgedAt: now.toISOString(),
    steps: existing?.steps ?? {
      stripeCanceled: true,
      automationsStopped: true,
      notificationsStopped: true,
      integrationsDisconnected: true,
    },
    updatedAt: now.toISOString(),
  };

  // Keep a tombstone for owner visibility, then delete Clerk identity.
  schedulePersistAccountDeletion(purged);
  await deleteClerkUser(userId);
  deleteAccountDeletionRecord(userId);

  return purged;
}

export async function getAccountDeletionStatus(
  userId: string,
): Promise<AccountDeletionRecord | null> {
  return ensureAccountDeletionHydrated(userId);
}

export async function listOwnerAccountDeletions(): Promise<
  AccountDeletionOwnerRow[]
> {
  const scheduled = await listScheduledAccountDeletions();
  const now = new Date();
  return scheduled.map((row) => ({
    userId: row.userId,
    email: row.email,
    planName: row.planName,
    status: row.status,
    requestedAt: row.requestedAt,
    deleteAfter: row.deleteAfter,
    restoreDeadline: row.deleteAfter,
    daysRemaining: daysRemaining(row.deleteAfter, now),
  }));
}

/** Owner / cron: purge all users whose deleteAfter has passed. */
export async function purgeDueAccountDeletions(): Promise<{
  purged: string[];
  errors: Array<{ userId: string; error: string }>;
}> {
  const due = (await listScheduledAccountDeletions()).filter(
    (row) => new Date(row.deleteAfter).getTime() <= Date.now(),
  );
  const purged: string[] = [];
  const errors: Array<{ userId: string; error: string }> = [];

  for (const row of due) {
    try {
      await purgeAccount(row.userId, ACCOUNT_DELETION_CONFIRMATION, {
        force: true,
      });
      purged.push(row.userId);
    } catch (error) {
      errors.push({
        userId: row.userId,
        error: error instanceof Error ? error.message : "purge failed",
      });
    }
  }

  return { purged, errors };
}
