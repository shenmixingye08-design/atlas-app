import { randomUUID } from "node:crypto";

import type { AcquisitionChannel } from "./constants";
import type {
  AcquisitionEvent,
  DiagnosisEventName,
  DiagnosisSession,
  EvidenceStatus,
  PublishedPackItem,
  ReferralRecord,
  UseCasePageStatus,
} from "./types";

type StoryRow = {
  id: string;
  userId: string;
  usedFor: string;
  helpful: string;
  improve: string;
  consent: string;
  published: boolean;
};

type Bucket = {
  sessions: Map<string, DiagnosisSession>;
  events: AcquisitionEvent[];
  referrals: Map<string, ReferralRecord>;
  stories: StoryRow[];
  adSpendByChannel: Partial<Record<AcquisitionChannel, number | null>>;
  vendorSpendByChannel: Partial<Record<AcquisitionChannel, number | null>>;
  evidenceStatuses: Map<string, EvidenceStatus>;
  useCaseStatuses: Map<string, UseCasePageStatus>;
  calendarSkips: Set<string>;
  lastPack: unknown;
  publishedItems: Map<string, PublishedPackItem>;
};

function emptyBucket(): Bucket {
  return {
    sessions: new Map(),
    events: [],
    referrals: new Map(),
    stories: [],
    adSpendByChannel: {},
    vendorSpendByChannel: {},
    evidenceStatuses: new Map(),
    useCaseStatuses: new Map(),
    calendarSkips: new Set(),
    lastPack: null,
    publishedItems: new Map(),
  };
}

function getBucket(): Bucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAcquisitionStore?: Bucket;
  };
  if (!globalScope.__atlasAcquisitionStore) {
    globalScope.__atlasAcquisitionStore = emptyBucket();
  }
  return globalScope.__atlasAcquisitionStore;
}

export function resetAcquisitionStoreForTests(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAcquisitionStore?: Bucket;
  };
  globalScope.__atlasAcquisitionStore = emptyBucket();
}

export function upsertDiagnosisSession(session: DiagnosisSession): DiagnosisSession {
  getBucket().sessions.set(session.sessionId, session);
  return session;
}

export function getDiagnosisSession(sessionId: string): DiagnosisSession | null {
  return getBucket().sessions.get(sessionId) ?? null;
}

export function findSessionByVisitor(visitorId: string): DiagnosisSession | null {
  return (
    [...getBucket().sessions.values()].find((row) => row.visitorId === visitorId) ?? null
  );
}

export function findSessionByUser(userId: string): DiagnosisSession | null {
  return (
    [...getBucket().sessions.values()].find(
      (row) => row.userId === userId || row.boundUserId === userId,
    ) ?? null
  );
}

export function listDiagnosisSessions(): DiagnosisSession[] {
  return [...getBucket().sessions.values()];
}

export function recordAcquisitionEvent(input: {
  eventName: DiagnosisEventName;
  dedupeKey: string;
  visitorId?: string | null;
  userId?: string | null;
  campaignId?: string | null;
  contentId?: string | null;
  channel: AcquisitionChannel;
}): { inserted: boolean } {
  const existing = getBucket().events.find((event) => event.dedupeKey === input.dedupeKey);
  if (existing) return { inserted: false };
  getBucket().events.unshift({
    eventId: `acq_${randomUUID()}`,
    eventName: input.eventName,
    occurredAt: new Date().toISOString(),
    visitorId: input.visitorId ?? null,
    userId: input.userId ?? null,
    campaignId: input.campaignId ?? null,
    contentId: input.contentId ?? null,
    channel: input.channel,
    dedupeKey: input.dedupeKey,
  });
  return { inserted: true };
}

export function listAcquisitionEvents(): AcquisitionEvent[] {
  return [...getBucket().events];
}

export function saveReferral(record: ReferralRecord): ReferralRecord {
  const next = {
    ...record,
    claimedUserIds: record.claimedUserIds ?? [],
  };
  getBucket().referrals.set(next.referralId, next);
  return next;
}

export function getReferral(referralId: string): ReferralRecord | null {
  return getBucket().referrals.get(referralId) ?? null;
}

export function listReferrals(): ReferralRecord[] {
  return [...getBucket().referrals.values()];
}

export function addStory(input: {
  userId: string;
  usedFor: string;
  helpful: string;
  improve: string;
  consent: string;
}): void {
  getBucket().stories.push({
    id: `st_${randomUUID()}`,
    published: false,
    ...input,
  });
}

export function listPublishableStories(): Array<{
  id: string;
  usedFor: string;
  helpful: string;
  improve: string;
  consent: string;
}> {
  return getBucket()
    .stories.filter((row) => row.published && row.consent !== "do_not_publish" && row.consent !== "ops_only")
    .map(({ id, usedFor, helpful, improve, consent }) => ({
      id,
      usedFor,
      helpful,
      improve,
      consent,
    }));
}

export function listAllStoriesForOwner() {
  return [...getBucket().stories];
}

export function replaceStories(rows: StoryRow[]): void {
  getBucket().stories = rows.map((row) => ({ ...row }));
}

export function setChannelSpend(
  kind: "ad" | "vendor",
  channel: AcquisitionChannel,
  yen: number | null,
): void {
  if (kind === "ad") getBucket().adSpendByChannel[channel] = yen;
  else getBucket().vendorSpendByChannel[channel] = yen;
}

export function getChannelSpend(): {
  ad: Partial<Record<AcquisitionChannel, number | null>>;
  vendor: Partial<Record<AcquisitionChannel, number | null>>;
} {
  return {
    ad: { ...getBucket().adSpendByChannel },
    vendor: { ...getBucket().vendorSpendByChannel },
  };
}

export function setEvidenceStatusOverride(id: string, status: EvidenceStatus): void {
  getBucket().evidenceStatuses.set(id, status);
}

export function getEvidenceStatusOverrides(): Record<string, EvidenceStatus> {
  return Object.fromEntries(getBucket().evidenceStatuses);
}

export function replaceEvidenceStatusOverrides(rows: Record<string, EvidenceStatus>): void {
  getBucket().evidenceStatuses = new Map(Object.entries(rows));
}

export function setUseCaseStatusOverride(slug: string, status: UseCasePageStatus): void {
  getBucket().useCaseStatuses.set(slug, status);
}

export function getUseCaseStatusOverrides(): Record<string, UseCasePageStatus> {
  return Object.fromEntries(getBucket().useCaseStatuses);
}

export function replaceUseCaseStatusOverrides(rows: Record<string, UseCasePageStatus>): void {
  getBucket().useCaseStatuses = new Map(Object.entries(rows));
}

export function skipCalendarIdea(key: string): void {
  getBucket().calendarSkips.add(key);
}

export function listCalendarSkips(): string[] {
  return [...getBucket().calendarSkips];
}

export function replaceCalendarSkips(keys: string[]): void {
  getBucket().calendarSkips = new Set(keys);
}

export function saveLastPack(pack: unknown): void {
  getBucket().lastPack = pack;
}

export function getLastPack(): unknown {
  return getBucket().lastPack;
}

export function savePublishedPackItem(item: PublishedPackItem): void {
  getBucket().publishedItems.set(item.contentId, item);
}

export function listPublishedPackItems(): PublishedPackItem[] {
  return [...getBucket().publishedItems.values()];
}

export function replacePublishedPackItems(items: PublishedPackItem[]): void {
  getBucket().publishedItems = new Map(items.map((item) => [item.contentId, item]));
}
