import "server-only";

import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import { ACQUISITION_DOMAIN } from "./constants";
import {
  getChannelSpend,
  getEvidenceStatusOverrides,
  getLastPack,
  getUseCaseStatusOverrides,
  listAcquisitionEvents,
  listAllStoriesForOwner,
  listCalendarSkips,
  listDiagnosisSessions,
  listPublishedPackItems,
  listReferrals,
  recordAcquisitionEvent,
  replaceCalendarSkips,
  replaceEvidenceStatusOverrides,
  replacePublishedPackItems,
  replaceStories,
  replaceUseCaseStatusOverrides,
  resetAcquisitionStoreForTests,
  saveLastPack,
  saveReferral,
  setChannelSpend,
  upsertDiagnosisSession,
} from "./store";
import type { AcquisitionChannel } from "./constants";
import type { EvidenceStatus, PublishedPackItem, UseCasePageStatus } from "./types";

const OWNER_KEY = "__atlas_acquisition__";
let hydrated = false;

type PersistedPayload = {
  sessions?: ReturnType<typeof listDiagnosisSessions>;
  events?: ReturnType<typeof listAcquisitionEvents>;
  referrals?: ReturnType<typeof listReferrals>;
  stories?: ReturnType<typeof listAllStoriesForOwner>;
  evidenceStatuses?: Record<string, EvidenceStatus>;
  useCaseStatuses?: Record<string, UseCasePageStatus>;
  adSpend?: Partial<Record<AcquisitionChannel, number | null>>;
  vendorSpend?: Partial<Record<AcquisitionChannel, number | null>>;
  calendarSkips?: string[];
  lastPack?: unknown;
  publishedItems?: PublishedPackItem[];
};

export async function ensureAcquisitionHydrated(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const loaded = await loadSupabaseUserState<{ payload?: PersistedPayload }>(
    OWNER_KEY,
    ACQUISITION_DOMAIN,
  );
  const inner = loaded?.payload?.payload;
  if (!inner) return;
  for (const session of inner.sessions ?? []) {
    upsertDiagnosisSession({
      ...session,
      referralId: session.referralId ?? null,
    });
  }
  for (const referral of inner.referrals ?? []) {
    saveReferral({
      ...referral,
      claimedUserIds: referral.claimedUserIds ?? [],
    });
  }
  for (const event of inner.events ?? []) {
    recordAcquisitionEvent(event);
  }
  if (inner.stories) replaceStories(inner.stories);
  if (inner.evidenceStatuses) replaceEvidenceStatusOverrides(inner.evidenceStatuses);
  if (inner.useCaseStatuses) replaceUseCaseStatusOverrides(inner.useCaseStatuses);
  if (inner.calendarSkips) replaceCalendarSkips(inner.calendarSkips);
  if (inner.lastPack) saveLastPack(inner.lastPack);
  if (inner.publishedItems) replacePublishedPackItems(inner.publishedItems);
  for (const [channel, yen] of Object.entries(inner.adSpend ?? {})) {
    setChannelSpend("ad", channel as AcquisitionChannel, yen);
  }
  for (const [channel, yen] of Object.entries(inner.vendorSpend ?? {})) {
    setChannelSpend("vendor", channel as AcquisitionChannel, yen);
  }
}

export async function persistAcquisition(): Promise<void> {
  const spend = getChannelSpend();
  await upsertSupabaseUserState(OWNER_KEY, ACQUISITION_DOMAIN, {
    version: 1,
    updatedAt: new Date().toISOString(),
    payload: {
      sessions: listDiagnosisSessions(),
      events: listAcquisitionEvents(),
      referrals: listReferrals(),
      stories: listAllStoriesForOwner(),
      evidenceStatuses: getEvidenceStatusOverrides(),
      useCaseStatuses: getUseCaseStatusOverrides(),
      adSpend: spend.ad,
      vendorSpend: spend.vendor,
      calendarSkips: listCalendarSkips(),
      lastPack: getLastPack(),
      publishedItems: listPublishedPackItems(),
    } satisfies PersistedPayload,
  });
}

export function resetAcquisitionHydrationForTests(): void {
  hydrated = false;
  resetAcquisitionStoreForTests();
}
