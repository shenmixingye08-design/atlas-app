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
  user_agent: string | null;
  failure_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
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
    userAgent: row.user_agent ?? null,
    failureCount: row.failure_count,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at ?? null,
  };
}

function endpointFingerprint(endpoint: string): string {
  // Never log full endpoint / keys — short stable fingerprint only.
  let hash = 0;
  for (let i = 0; i < endpoint.length; i += 1) {
    hash = (hash * 31 + endpoint.charCodeAt(i)) >>> 0;
  }
  return `ep_${hash.toString(16).padStart(8, "0")}`;
}

function isTestMemoryAllowed(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

type MemoryBucket = Map<string, PushSubscriptionRecord>;

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasPushSubscriptions?: MemoryBucket;
  };
  if (!scope.__atlasPushSubscriptions) {
    scope.__atlasPushSubscriptions = new Map();
  }
  return scope.__atlasPushSubscriptions;
}

export function resetPushSubscriptionStoreForTests(): void {
  getMemoryBucket().clear();
}

function newMemorySubscriptionId(): string {
  return `psub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function upsertMemorySubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
  platform?: string | null;
  browser?: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
}): PushSubscriptionRecord {
  const bucket = getMemoryBucket();
  const now = new Date().toISOString();
  const existing = bucket.get(input.endpoint);
  if (existing) {
    const next: PushSubscriptionRecord = {
      ...existing,
      userId: input.userId,
      p256dh: input.p256dh,
      authKey: input.authKey,
      platform: input.platform ?? existing.platform,
      browser: input.browser ?? existing.browser,
      deviceName: input.deviceName ?? existing.deviceName,
      userAgent: input.userAgent ?? existing.userAgent,
      failureCount: 0,
      isActive: true,
      updatedAt: now,
      lastUsedAt: now,
    };
    bucket.set(input.endpoint, next);
    return next;
  }
  const created: PushSubscriptionRecord = {
    id: newMemorySubscriptionId(),
    userId: input.userId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    authKey: input.authKey,
    platform: input.platform ?? null,
    browser: input.browser ?? null,
    deviceName: input.deviceName ?? null,
    userAgent: input.userAgent ?? null,
    failureCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  };
  bucket.set(input.endpoint, created);
  return created;
}

export async function upsertPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
  platform?: string | null;
  browser?: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
}): Promise<PushSubscriptionRecord | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isTestMemoryAllowed()) {
      return upsertMemorySubscription(input);
    }
    console.warn(
      "[push] subscription upsert skipped: Supabase service role not configured",
    );
    return null;
  }

  const now = new Date().toISOString();

  // Endpoint is globally unique. Reassign to the current Clerk user when the
  // same browser device logs in as a different account (prevents stale ownership).
  const { data: existing, error: lookupError } = await client
    .from(TABLE)
    .select("*")
    .eq("endpoint", input.endpoint)
    .maybeSingle();

  if (lookupError) {
    console.warn(
      "[push] subscription lookup failed:",
      lookupError.message,
      endpointFingerprint(input.endpoint),
    );
  }

  if (existing) {
    const { data, error } = await client
      .from(TABLE)
      .update({
        user_id: input.userId,
        p256dh: input.p256dh,
        auth_key: input.authKey,
        platform: input.platform ?? null,
        browser: input.browser ?? null,
        device_name: input.deviceName ?? null,
        user_agent: input.userAgent ?? null,
        failure_count: 0,
        is_active: true,
        updated_at: now,
        last_used_at: now,
      })
      .eq("endpoint", input.endpoint)
      .select("*")
      .single();

    if (error || !data) {
      console.warn(
        "[push] subscription update failed:",
        error?.message,
        endpointFingerprint(input.endpoint),
      );
      return null;
    }
    return mapRow(data as DbRow);
  }

  const { data, error } = await client
    .from(TABLE)
    .insert({
      user_id: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth_key: input.authKey,
      platform: input.platform ?? null,
      browser: input.browser ?? null,
      device_name: input.deviceName ?? null,
      user_agent: input.userAgent ?? null,
      failure_count: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
      last_used_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.warn(
      "[push] subscription insert failed:",
      error?.message,
      endpointFingerprint(input.endpoint),
    );
    return null;
  }
  return mapRow(data as DbRow);
}

export async function listActivePushSubscriptions(
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (!isTestMemoryAllowed()) return [];
    return [...getMemoryBucket().values()].filter(
      (row) => row.userId === userId && row.isActive,
    );
  }

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
  if (!client) {
    if (!isTestMemoryAllowed()) return [];
    return [...getMemoryBucket().values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

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
  if (!client) {
    if (!isTestMemoryAllowed()) return false;
    const existing = getMemoryBucket().get(input.endpoint);
    if (!existing || existing.userId !== input.userId) return false;
    getMemoryBucket().set(input.endpoint, {
      ...existing,
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

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
  if (!client) {
    if (!isTestMemoryAllowed()) return false;
    for (const [endpoint, row] of getMemoryBucket()) {
      if (row.id === input.subscriptionId && row.userId === input.userId) {
        getMemoryBucket().set(endpoint, {
          ...row,
          isActive: input.isActive,
          failureCount: input.isActive ? 0 : row.failureCount,
          updatedAt: new Date().toISOString(),
        });
        return true;
      }
    }
    return false;
  }

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

export async function touchPushSubscription(input: {
  userId: string;
  endpoint: string;
}): Promise<void> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (!isTestMemoryAllowed()) return;
    const existing = getMemoryBucket().get(input.endpoint);
    if (!existing || existing.userId !== input.userId || !existing.isActive) {
      return;
    }
    const now = new Date().toISOString();
    getMemoryBucket().set(input.endpoint, {
      ...existing,
      lastUsedAt: now,
      updatedAt: now,
      failureCount: 0,
    });
    return;
  }

  const now = new Date().toISOString();
  await client
    .from(TABLE)
    .update({ last_used_at: now, updated_at: now, failure_count: 0 })
    .eq("user_id", input.userId)
    .eq("endpoint", input.endpoint)
    .eq("is_active", true);
}

export async function recordPushFailure(input: {
  userId: string;
  endpoint: string;
  reason: string;
}): Promise<void> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (!isTestMemoryAllowed()) return;
    const existing = getMemoryBucket().get(input.endpoint);
    if (!existing || existing.userId !== input.userId) return;
    const nextCount = existing.failureCount + 1;
    const deactivate = nextCount >= 5;
    getMemoryBucket().set(input.endpoint, {
      ...existing,
      failureCount: nextCount,
      isActive: deactivate ? false : existing.isActive,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const { data } = await client
    .from(TABLE)
    .select("failure_count")
    .eq("user_id", input.userId)
    .eq("endpoint", input.endpoint)
    .maybeSingle();

  const nextCount =
    (typeof data?.failure_count === "number" ? data.failure_count : 0) + 1;
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
      endpointFingerprint(input.endpoint),
    );
  }
}

export async function deletePushSubscription(input: {
  userId: string;
  endpoint: string;
}): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (!isTestMemoryAllowed()) return false;
    const existing = getMemoryBucket().get(input.endpoint);
    if (!existing || existing.userId !== input.userId) return false;
    getMemoryBucket().delete(input.endpoint);
    return true;
  }

  const { error } = await client
    .from(TABLE)
    .delete()
    .eq("user_id", input.userId)
    .eq("endpoint", input.endpoint);

  return !error;
}

/** Delete or deactivate expired / gone subscriptions (404/410 path). */
export async function pruneInvalidPushSubscription(input: {
  userId: string;
  endpoint: string;
  hardDelete?: boolean;
}): Promise<void> {
  if (input.hardDelete) {
    await deletePushSubscription(input);
    return;
  }
  await deactivatePushSubscription(input);
}
