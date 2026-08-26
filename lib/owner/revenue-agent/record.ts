import { randomUUID } from "node:crypto";

import type { RevenueAgentEvent, RevenueEventName } from "./events";
import { schedulePersistRevenueAgent } from "./durable";
import { findEventByDedupeKey, insertRevenueEvent } from "./store";

export function recordRevenueEvent(input: {
  eventName: RevenueEventName;
  dedupeKey: string;
  occurredAt?: string;
  anonymousVisitorId?: string | null;
  userId?: string | null;
  campaignId?: string | null;
  contentId?: string | null;
  source?: string | null;
  medium?: string | null;
  metadata?: RevenueAgentEvent["metadata"];
}): { event: RevenueAgentEvent; inserted: boolean } {
  const existing = findEventByDedupeKey(input.dedupeKey);
  if (existing) return { event: existing, inserted: false };

  const event: RevenueAgentEvent = {
    eventId: `evt_${randomUUID()}`,
    eventName: input.eventName,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    anonymousVisitorId: input.anonymousVisitorId ?? null,
    userId: input.userId ?? null,
    campaignId: input.campaignId ?? null,
    contentId: input.contentId ?? null,
    source: input.source ?? null,
    medium: input.medium ?? null,
    dedupeKey: input.dedupeKey,
    metadata: input.metadata ?? {},
  };
  const stored = insertRevenueEvent(event);
  if (stored.eventId === event.eventId) {
    schedulePersistRevenueAgent();
  }
  return { event: stored, inserted: stored.eventId === event.eventId };
}
