import "server-only";

import { FIRST_OFFER_CONTENT_ID, FIRST_REVENUE_CAMPAIGN_ID } from "./constants";
import { ensureFirstRevenueHydrated, persistFirstRevenue } from "./durable";
import { firstOfferCopy } from "./offer";
import { buildSprintPosts } from "./posts";
import {
  findOfferSession,
  getOfferLpStatus,
  listFirstRevenueEvents,
  listPublishedUrls,
  recordFirstRevenueEvent,
  savePublishedUrl,
  setOfferLpStatus,
  upsertOfferSession,
} from "./store";
import { buildNextAction, resolveDropoff } from "./suggestion";
import type { FirstRevenueEventName, OfferLpStatus, SprintGoalState } from "./types";

function countNamed(name: FirstRevenueEventName): number {
  return listFirstRevenueEvents().filter((event) => event.eventName === name).length;
}

function uniqueVisitors(name: FirstRevenueEventName): number {
  return new Set(
    listFirstRevenueEvents()
      .filter((event) => event.eventName === name)
      .map((event) => event.visitorId)
      .filter((value): value is string => Boolean(value)),
  ).size;
}

function goal(count: number): SprintGoalState {
  return count > 0 ? "met" : "unmet";
}

export async function recordOfferEvent(input: {
  eventName: FirstRevenueEventName;
  visitorId?: string | null;
  userId?: string | null;
  contentId?: string | null;
  livemode?: boolean | null;
  amountYen?: number | null;
}): Promise<{ inserted: boolean; skipped?: boolean }> {
  await ensureFirstRevenueHydrated();
  const conversion: FirstRevenueEventName[] = [
    "signup_completed",
    "first_use_started",
    "first_use_succeeded",
    "first_use_failed",
    "upgrade_viewed",
    "checkout_started",
    "checkout_completed",
    "invoice_paid",
  ];
  if (conversion.includes(input.eventName)) {
    const session = findOfferSession({ userId: input.userId, visitorId: input.visitorId });
    if (!session) return { inserted: false, skipped: true };
  }
  if (input.eventName === "invoice_paid" && input.livemode !== true) {
    const result = recordFirstRevenueEvent({
      eventName: input.eventName,
      dedupeKey: `invoice_paid:test:${input.userId ?? input.visitorId ?? "anon"}`,
      visitorId: input.visitorId,
      userId: input.userId,
      contentId: input.contentId ?? FIRST_OFFER_CONTENT_ID,
      livemode: false,
      amountYen: input.amountYen ?? null,
    });
    await persistFirstRevenue();
    return result;
  }
  const keyUser = input.userId ?? input.visitorId ?? "anon";
  const result = recordFirstRevenueEvent({
    eventName: input.eventName,
    dedupeKey: `${input.eventName}:${keyUser}:${input.contentId ?? FIRST_OFFER_CONTENT_ID}`,
    visitorId: input.visitorId,
    userId: input.userId,
    contentId: input.contentId ?? FIRST_OFFER_CONTENT_ID,
    livemode: input.livemode ?? null,
    amountYen: input.amountYen ?? null,
  });
  if (input.eventName === "offer_lp_viewed" || input.eventName === "offer_cta_clicked") {
    upsertOfferSession({
      visitorId: input.visitorId ?? null,
      userId: input.userId ?? null,
      campaignId: FIRST_REVENUE_CAMPAIGN_ID,
      contentId: input.contentId ?? FIRST_OFFER_CONTENT_ID,
      boundAt: null,
    });
  }
  await persistFirstRevenue();
  return result;
}

export async function bindOfferToUser(input: {
  userId: string;
  visitorId: string | null;
}): Promise<boolean> {
  await ensureFirstRevenueHydrated();
  const session = findOfferSession({ visitorId: input.visitorId, userId: input.userId });
  if (!session) return false;
  upsertOfferSession({
    ...session,
    userId: input.userId,
    visitorId: input.visitorId ?? session.visitorId,
    boundAt: new Date().toISOString(),
  });
  await recordOfferEvent({
    eventName: "signup_completed",
    userId: input.userId,
    visitorId: input.visitorId,
    contentId: session.contentId,
  });
  return true;
}

export async function markManualPost(contentId: string, postUrl: string) {
  if (!/^https?:\/\//.test(postUrl.trim())) {
    return { ok: false as const, error: "投稿URLがないため成功扱いしません" };
  }
  await ensureFirstRevenueHydrated();
  savePublishedUrl(contentId, postUrl.trim());
  await persistFirstRevenue();
  return { ok: true as const };
}

export async function setLpStatus(status: OfferLpStatus) {
  await ensureFirstRevenueHydrated();
  setOfferLpStatus(status);
  await persistFirstRevenue();
}

export async function getOwnerSprintSnapshot() {
  await ensureFirstRevenueHydrated();
  const events = listFirstRevenueEvents();
  const counts = {
    offer_lp_viewed: events.some((event) => event.eventName === "offer_lp_viewed")
      ? countNamed("offer_lp_viewed")
      : null,
    offer_cta_clicked: events.some((event) => event.eventName === "offer_cta_clicked")
      ? countNamed("offer_cta_clicked")
      : null,
    signup_completed: events.some((event) => event.eventName === "signup_completed")
      ? countNamed("signup_completed")
      : null,
    first_use_started: events.some((event) => event.eventName === "first_use_started")
      ? countNamed("first_use_started")
      : null,
    first_use_succeeded: events.some((event) => event.eventName === "first_use_succeeded")
      ? countNamed("first_use_succeeded")
      : null,
    first_use_failed: events.some((event) => event.eventName === "first_use_failed")
      ? countNamed("first_use_failed")
      : null,
    upgrade_viewed: events.some((event) => event.eventName === "upgrade_viewed")
      ? countNamed("upgrade_viewed")
      : null,
    checkout_started: events.some((event) => event.eventName === "checkout_started")
      ? countNamed("checkout_started")
      : null,
    checkout_completed: events.some((event) => event.eventName === "checkout_completed")
      ? countNamed("checkout_completed")
      : null,
    invoice_paid: events.some((event) => event.eventName === "invoice_paid")
      ? countNamed("invoice_paid")
      : null,
  };
  const liveCashEvents = events.filter(
    (event) => event.eventName === "invoice_paid" && event.livemode === true && event.amountYen != null,
  );
  const liveCashYen =
    liveCashEvents.length > 0
      ? liveCashEvents.reduce((sum, event) => sum + (event.amountYen ?? 0), 0)
      : null;
  const dropoff = resolveDropoff(counts);
  const posts = buildSprintPosts();
  const published = listPublishedUrls();
  return {
    copy: firstOfferCopy(),
    lpStatus: getOfferLpStatus(),
    posts,
    todayPost: posts[0],
    publishedCount: Object.keys(published).length > 0 ? Object.keys(published).length : null,
    uniqueClicks: events.some((event) => event.eventName === "offer_lp_viewed")
      ? uniqueVisitors("offer_lp_viewed")
      : null,
    counts,
    liveCashYen,
    dropoff,
    nextAction: buildNextAction(dropoff),
    goals: {
      signup: goal(countNamed("signup_completed")),
      firstSuccess: goal(countNamed("first_use_succeeded")),
      checkout: goal(countNamed("checkout_started")),
      paid: goal(countNamed("checkout_completed")),
      liveCash: liveCashYen != null && liveCashYen > 0 ? ("met" as const) : ("unmet" as const),
    },
  };
}

export { firstOfferCopy };
