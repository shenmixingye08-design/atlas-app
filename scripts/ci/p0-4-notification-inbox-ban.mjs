#!/usr/bin/env node
/**
 * CI gate (P0-4): Production notification inbox must be durable per-user DB,
 * not a global process-memory buffer / Map SoT / DB→memory fallback.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const store = read("lib/notifications/store.ts");
if (!/MAX_NOTIFICATIONS_PER_USER/.test(store)) {
  violations.push(
    "lib/notifications/store.ts: MAX_NOTIFICATIONS_PER_USER required (no shared global buffer)",
  );
}
if (
  /bucket\.length\s*=\s*MAX_NOTIFICATIONS[^_]/.test(store) ||
  /slice\(0,\s*MAX_NOTIFICATIONS[^_]/.test(store)
) {
  violations.push(
    "lib/notifications/store.ts: global truncate across all users is forbidden",
  );
}
if (!/audience === "user" && !filter\.userId\?\.trim\(\)/.test(store)) {
  violations.push(
    "lib/notifications/store.ts: user audience list without userId must return []",
  );
}
if (!/trimUserNotifications/.test(store)) {
  violations.push(
    "lib/notifications/store.ts: per-user trimUserNotifications required",
  );
}

const backend = read("lib/notifications/notification-backend.ts");
if (!/memory_durable inbox is forbidden in Production/.test(backend)) {
  violations.push(
    "lib/notifications/notification-backend.ts: Production must forbid memory_durable",
  );
}
if (!/isAtlasProduction/.test(backend)) {
  violations.push(
    "lib/notifications/notification-backend.ts: Production gate missing",
  );
}

const durable = read("lib/notifications/durable-inbox.ts");
if (!/NotificationInboxUnavailableError/.test(durable)) {
  violations.push(
    "lib/notifications/durable-inbox.ts: NotificationInboxUnavailableError missing",
  );
}
if (!/memory fallback disabled/.test(durable)) {
  violations.push(
    "lib/notifications/durable-inbox.ts: must fail-closed with memory fallback disabled",
  );
}
if (!/idempotencyKey|idempotency_key/.test(durable)) {
  violations.push("lib/notifications/durable-inbox.ts: idempotency key missing");
}
if (!/scheduleDurableDeliveryRetry/.test(durable)) {
  violations.push(
    "lib/notifications/durable-inbox.ts: durable delivery retry missing",
  );
}
if (!/ownerId required for inbox list/.test(durable)) {
  violations.push(
    "lib/notifications/durable-inbox.ts: ownerId-required list guard missing",
  );
}

const service = read("lib/notifications/service.ts");
if (!/export async function createUserNotification/.test(service)) {
  violations.push(
    "lib/notifications/service.ts: createUserNotification must be async",
  );
}
if (!/await insertDurableNotification/.test(service)) {
  violations.push(
    "lib/notifications/service.ts: must await durable insert before delivery",
  );
}

const migration = read(
  "supabase/migrations/20260804_p0_4_durable_user_notifications.sql",
);
for (const needle of [
  "atlas_user_notifications",
  "owner_id",
  "organization_id",
  "idempotency_key",
  "read_at",
  "expires_at",
  "atlas_user_notifications_idempotency_uidx",
]) {
  if (!migration.toLowerCase().includes(needle.toLowerCase())) {
    violations.push(
      `supabase/migrations/20260804_p0_4_durable_user_notifications.sql: missing ${needle}`,
    );
  }
}

const index = read("lib/notifications/index.ts");
if (
  /resetDurableInboxForTests|getMemoryBucket|__atlasDurableNotificationInbox/.test(
    index,
  )
) {
  violations.push(
    "lib/notifications/index.ts: test fake / memory durable helpers must not be public exports",
  );
}

if (violations.length) {
  console.error("P0-4 notification inbox CI ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P0-4 notification inbox CI ban OK");
