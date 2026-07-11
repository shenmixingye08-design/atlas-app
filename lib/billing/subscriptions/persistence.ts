import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import { clerkClient } from "@clerk/nextjs/server";

import type { UserSubscriptionRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data", "billing");
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "subscriptions.json");
const WEBHOOK_EVENTS_FILE = path.join(DATA_DIR, "processed-webhook-events.json");

const CLERK_BILLING_KEY = "atlasBilling";

type SubscriptionFileShape = {
  version: 1;
  records: Record<string, UserSubscriptionRecord>;
};

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readSubscriptionsFromDisk(): Map<string, UserSubscriptionRecord> {
  try {
    if (!existsSync(SUBSCRIPTIONS_FILE)) return new Map();
    const raw = readFileSync(SUBSCRIPTIONS_FILE, "utf8");
    const parsed = JSON.parse(raw) as SubscriptionFileShape;
    if (!parsed?.records || typeof parsed.records !== "object") return new Map();
    return new Map(Object.entries(parsed.records));
  } catch {
    return new Map();
  }
}

export function writeSubscriptionsToDisk(
  records: Map<string, UserSubscriptionRecord>,
): void {
  try {
    ensureDataDir();
    const payload: SubscriptionFileShape = {
      version: 1,
      records: Object.fromEntries(records.entries()),
    };
    writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("[billing] Failed to persist subscriptions to disk:", error);
  }
}

export function readProcessedWebhookEventsFromDisk(): Set<string> {
  try {
    if (!existsSync(WEBHOOK_EVENTS_FILE)) return new Set();
    const raw = readFileSync(WEBHOOK_EVENTS_FILE, "utf8");
    const parsed = JSON.parse(raw) as { eventIds?: string[] };
    return new Set(Array.isArray(parsed.eventIds) ? parsed.eventIds : []);
  } catch {
    return new Set();
  }
}

export function writeProcessedWebhookEventsToDisk(eventIds: Set<string>): void {
  try {
    ensureDataDir();
    const ids = [...eventIds].slice(-2000);
    writeFileSync(
      WEBHOOK_EVENTS_FILE,
      JSON.stringify({ version: 1, eventIds: ids }, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("[billing] Failed to persist webhook idempotency:", error);
  }
}

function isSubscriptionRecord(value: unknown): value is UserSubscriptionRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string" && typeof row.planId === "string";
}

/** Best-effort durable copy on Clerk privateMetadata (survives serverless restarts). */
export async function persistSubscriptionToClerk(
  record: UserSubscriptionRecord,
): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(record.userId);
    const existing =
      user.privateMetadata && typeof user.privateMetadata === "object"
        ? { ...user.privateMetadata }
        : {};

    await client.users.updateUserMetadata(record.userId, {
      privateMetadata: {
        ...existing,
        [CLERK_BILLING_KEY]: record,
      },
    });
  } catch (error) {
    console.error("[billing] Failed to persist subscription to Clerk:", error);
  }
}

export async function loadSubscriptionFromClerk(
  userId: string,
): Promise<UserSubscriptionRecord | null> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return null;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const billing = user.privateMetadata?.[CLERK_BILLING_KEY];
    return isSubscriptionRecord(billing) ? billing : null;
  } catch {
    return null;
  }
}
