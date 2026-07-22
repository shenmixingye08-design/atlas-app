import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { PushSubscriptionRecord } from "./types";

const TABLE = "atlas_push_subscriptions";

type DbRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  platform: string | null;
  browser: string | null;
  device_name: string | null;
  failure_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    authKey: row.auth_key,
    platform: row.platform,
    browser: row.browser,
    deviceName: row.device_name,
    failureCount: row.failure_count,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
  platform?: string | null;
  browser?: string | null;
  deviceName?: string | null;
}): Promise<PushSubscriptionRecord | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  const now = new Date().toISOString();
  const row = {
    user_id: input.userId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth_key: input.authKey,
    platform: input.platform ?? null,
    browser: input.browser ?? null,
    device_name: input.deviceName ?? null,
    failure_count: 0,
    is_active: true,
    updated_at: now,
  };

  const { data, error } = await client
    .from(TABLE)
    .upsert(row, { onConflict: "user_id,endpoint" })
    .select("*")
    .single();

  if (error || !data) {
    console.warn("[push] subscription upsert failed:", error?.message);
    return null;
  }
  return mapRow(data as DbRow);
}

export async function listActivePushSubscriptions(
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];

  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => mapRow(row as DbRow));
}

export async function listAllPushSubscriptions(
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];

  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => mapRow(row as DbRow));
}

export async function deactivatePushSubscription(input: {
  userId: string;
  endpoint: string;
}): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  const { error } = await client
    .from(TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .eq("endpoint", input.endpoint);

  return !error;
}

export async function setPushSubscriptionActive(input: {
  userId: string;
  subscriptionId: string;
  isActive: boolean;
}): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  const { error } = await client
    .from(TABLE)
    .update({
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
      ...(input.isActive ? { failure_count: 0 } : {}),
    })
    .eq("user_id", input.userId)
    .eq("id", input.subscriptionId);

  return !error;
}

export async function recordPushFailure(input: {
  userId: string;
  endpoint: string;
  reason: string;
}): Promise<void> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return;

  const { data } = await client
    .from(TABLE)
    .select("failure_count")
    .eq("user_id", input.userId)
    .eq("endpoint", input.endpoint)
    .maybeSingle();

  const nextCount = (typeof data?.failure_count === "number" ? data.failure_count : 0) + 1;
  const deactivate = nextCount >= 5;

  await client
    .from(TABLE)
    .update({
      failure_count: nextCount,
      is_active: deactivate ? false : true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("endpoint", input.endpoint);

  if (deactivate) {
    console.warn(
      `[push] deactivated subscription after ${nextCount} failures:`,
      input.reason.slice(0, 120),
    );
  }
}

export async function deletePushSubscription(input: {
  userId: string;
  endpoint: string;
}): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  const { error } = await client
    .from(TABLE)
    .delete()
    .eq("user_id", input.userId)
    .eq("endpoint", input.endpoint);

  return !error;
}
