import { randomUUID } from "node:crypto";

import { FIRST_OFFER_CONTENT_ID, FIRST_REVENUE_CAMPAIGN_ID } from "./constants";
import type {
  FirstRevenueEvent,
  FirstRevenueEventName,
  FirstRevenueSession,
  OfferLpStatus,
} from "./types";

type Bucket = {
  events: FirstRevenueEvent[];
  sessions: FirstRevenueSession[];
  lpStatus: OfferLpStatus;
  publishedUrls: Record<string, string>;
};

function emptyBucket(): Bucket {
  return {
    events: [],
    sessions: [],
    lpStatus: "draft",
    publishedUrls: {},
  };
}

function getBucket(): Bucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasFirstRevenueStore?: Bucket;
  };
  if (!globalScope.__atlasFirstRevenueStore) {
    globalScope.__atlasFirstRevenueStore = emptyBucket();
  }
  return globalScope.__atlasFirstRevenueStore;
}

export function resetFirstRevenueStoreForTests(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasFirstRevenueStore?: Bucket;
  };
  globalScope.__atlasFirstRevenueStore = emptyBucket();
}

export function recordFirstRevenueEvent(input: {
  eventName: FirstRevenueEventName;
  dedupeKey: string;
  visitorId?: string | null;
  userId?: string | null;
  campaignId?: string;
  contentId?: string;
  livemode?: boolean | null;
  amountYen?: number | null;
}): { inserted: boolean } {
  const existing = getBucket().events.find((event) => event.dedupeKey === input.dedupeKey);
  if (existing) return { inserted: false };
  getBucket().events.unshift({
    eventId: `fr_${randomUUID()}`,
    eventName: input.eventName,
    occurredAt: new Date().toISOString(),
    visitorId: input.visitorId ?? null,
    userId: input.userId ?? null,
    campaignId: input.campaignId ?? FIRST_REVENUE_CAMPAIGN_ID,
    contentId: input.contentId ?? FIRST_OFFER_CONTENT_ID,
    livemode: input.livemode ?? null,
    amountYen: input.amountYen ?? null,
    dedupeKey: input.dedupeKey,
  });
  return { inserted: true };
}

export function listFirstRevenueEvents(): FirstRevenueEvent[] {
  return [...getBucket().events];
}

export function replaceFirstRevenueEvents(events: FirstRevenueEvent[]): void {
  getBucket().events = events.map((event) => ({ ...event }));
}

export function upsertOfferSession(session: FirstRevenueSession): void {
  const bucket = getBucket();
  const index = bucket.sessions.findIndex(
    (row) =>
      (session.userId && row.userId === session.userId) ||
      (session.visitorId && row.visitorId === session.visitorId),
  );
  if (index >= 0) bucket.sessions[index] = session;
  else bucket.sessions.push(session);
}

export function findOfferSession(input: {
  userId?: string | null;
  visitorId?: string | null;
}): FirstRevenueSession | null {
  return (
    getBucket().sessions.find(
      (row) =>
        (input.userId && row.userId === input.userId) ||
        (input.visitorId && row.visitorId === input.visitorId),
    ) ?? null
  );
}

export function listOfferSessions(): FirstRevenueSession[] {
  return [...getBucket().sessions];
}

export function replaceOfferSessions(sessions: FirstRevenueSession[]): void {
  getBucket().sessions = sessions.map((row) => ({ ...row }));
}

export function getOfferLpStatus(): OfferLpStatus {
  return getBucket().lpStatus;
}

export function setOfferLpStatus(status: OfferLpStatus): void {
  getBucket().lpStatus = status;
}

export function savePublishedUrl(contentId: string, url: string): void {
  getBucket().publishedUrls[contentId] = url;
}

export function listPublishedUrls(): Record<string, string> {
  return { ...getBucket().publishedUrls };
}

export function replacePublishedUrls(rows: Record<string, string>): void {
  getBucket().publishedUrls = { ...rows };
}
