import { describe, expect, it } from "vitest";

import { decideOwnerAccess } from "@/lib/auth/owner-access";

import {
  applyVisitTouch,
  attributedContentForUser,
  buildVisitorUserLink,
  canCountSignup,
  createVisitorId,
  isRecentClerkSignup,
  isWithinAttributionWindow,
  touchFromParams,
} from "./attribution";
import { REVENUE_AGENT_CAMPAIGN_ID } from "./constants";
import { displayMeasured, displayRate, safeRate } from "./display";
import {
  clickDedupeKey,
  firstJobDedupeKey,
  invoicePaidDedupeKey,
  signupDedupeKey,
} from "./events";
import { buildContentRows, buildFunnelTotals, contentVerdict } from "./funnel";
import { scoreByRevenuePriority } from "./learning";
import { observeStripeRevenueEvent } from "./observe";
import { recordRevenueEvent } from "./record";
import { canPublishNow } from "./publish-policy";
import { editRevenueItem } from "./service";
import {
  insertRevenueEvent,
  listRevenueEvents,
  resetRevenueAgentStoreForTests,
  upsertRevenueItem,
  upsertVisitorUserLink,
} from "./store";
import { resetRevenueAgentHydrationForTests } from "./durable";
import type { RevenueContent } from "./types";
import { emptyMetrics } from "./defaults";
import { buildRevenueUtmUrl } from "./utm";

function item(partial: Partial<RevenueContent> = {}): RevenueContent {
  const id = partial.id ?? "ra_loop_1";
  const now = new Date().toISOString();
  return {
    id,
    campaign: REVENUE_AGENT_CAMPAIGN_ID,
    campaignId: REVENUE_AGENT_CAMPAIGN_ID,
    contentId: partial.contentId ?? id,
    status: "published",
    kind: "pain_point",
    platform: "x",
    title: "theme",
    hook: "hook",
    body: "body",
    cta: "無料登録",
    recommendedPlatform: "x",
    assumedTarget: "副業者・個人事業主",
    painPoint: "繰り返し作業",
    intent: "登録",
    featureExample: "X投稿",
    signupPath: "/sign-up",
    desiredAction: "無料登録",
    reason: "reason",
    claimCheck: { ok: true, hits: [] },
    video: null,
    utmUrl: "https://example.test/sign-up",
    trackingUrl: `/r/${id}`,
    scheduledAt: null,
    publishedAt: now,
    postUrl: "https://x.com/i/web/status/1",
    xTweetId: "1",
    idempotencyKey: `ra_pub_${id}`,
    attemptCount: 1,
    maxAttempts: 3,
    lastError: null,
    failedStage: null,
    retryable: false,
    metrics: emptyMetrics(),
    metricSource: {
      impressions: "unknown",
      likes: "unknown",
      replies: "unknown",
      reposts: "unknown",
      linkClicks: "unknown",
      lpVisits: "unknown",
      signups: "unknown",
      paidConversions: "unknown",
      revenueYen: "unknown",
    },
    generationMode: "template",
    createdAt: now,
    updatedAt: now,
    generationId: "gen_loop",
    ...partial,
  };
}

describe("UTM and contentId uniqueness", () => {
  it("includes required query params on a real /sign-up path", () => {
    const url = buildRevenueUtmUrl({
      lpUrl: "/sign-up",
      platform: "x",
      kind: "minervot_use_case",
      contentId: "ra_unique",
      origin: "https://example.test",
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/sign-up");
    expect(parsed.searchParams.get("utm_source")).toBe("x");
    expect(parsed.searchParams.get("utm_medium")).toBe("social");
    expect(parsed.searchParams.get("utm_campaign")).toBe(REVENUE_AGENT_CAMPAIGN_ID);
    expect(parsed.searchParams.get("utm_content")).toBe("ra_unique");
    expect(parsed.searchParams.get("campaignId")).toBe(REVENUE_AGENT_CAMPAIGN_ID);
    expect(parsed.searchParams.get("contentId")).toBe("ra_unique");
  });
});

describe("click dedupe and visitor bind", () => {
  it("dedupes the same visitor+content click", () => {
    resetRevenueAgentStoreForTests();
    const visitorId = createVisitorId();
    const first = recordRevenueEvent({
      eventName: "link_clicked",
      dedupeKey: clickDedupeKey("ra_1", visitorId),
      anonymousVisitorId: visitorId,
      contentId: "ra_1",
      campaignId: REVENUE_AGENT_CAMPAIGN_ID,
      source: "x",
      medium: "social",
    });
    const second = recordRevenueEvent({
      eventName: "link_clicked",
      dedupeKey: clickDedupeKey("ra_1", visitorId),
      anonymousVisitorId: visitorId,
      contentId: "ra_1",
      campaignId: REVENUE_AGENT_CAMPAIGN_ID,
      source: "x",
      medium: "social",
    });
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.event.eventId).toBe(first.event.eventId);
    expect(listRevenueEvents().filter((row) => row.eventName === "link_clicked")).toHaveLength(1);
  });

  it("binds visitor to user and does not attribute organic signup", () => {
    const visitor = applyVisitTouch(
      null,
      touchFromParams({ contentId: "ra_1", at: new Date().toISOString() }),
    );
    const link = buildVisitorUserLink({ visitor, userId: "user_new" });
    expect(link.attributedContentId).toBe("ra_1");

    const organic = canCountSignup({
      userId: "user_organic",
      clerkCreatedAtMs: Date.now(),
      existingEvents: [],
      link: {
        ...link,
        userId: "user_organic",
        attributedContentId: null,
      },
    });
    expect(organic.ok).toBe(false);
    if (!organic.ok) expect(organic.reason).toBe("organic_unattributed");

    const attributed = canCountSignup({
      userId: "user_new",
      clerkCreatedAtMs: Date.now(),
      existingEvents: [],
      link,
    });
    expect(attributed.ok).toBe(true);

    const relogin = canCountSignup({
      userId: "user_new",
      clerkCreatedAtMs: Date.now() - 10 * 24 * 60 * 60 * 1000,
      existingEvents: [],
      link,
    });
    expect(relogin.ok).toBe(false);
    if (!relogin.ok) expect(relogin.reason).toBe("not_new_signup");

    const duplicate = canCountSignup({
      userId: "user_new",
      clerkCreatedAtMs: Date.now(),
      existingEvents: [
        {
          eventId: "evt_1",
          eventName: "signup_completed",
          occurredAt: new Date().toISOString(),
          anonymousVisitorId: visitor.visitorId,
          userId: "user_new",
          campaignId: REVENUE_AGENT_CAMPAIGN_ID,
          contentId: "ra_1",
          source: "x",
          medium: "social",
          dedupeKey: signupDedupeKey("user_new"),
          metadata: {},
        },
      ],
      link,
    });
    expect(duplicate.ok).toBe(false);
  });

  it("keeps first and last touch distinct and expires after 30 days", () => {
    const firstAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const lastAt = new Date().toISOString();
    let visitor = applyVisitTouch(
      null,
      touchFromParams({ contentId: "ra_first", at: firstAt }),
    );
    visitor = applyVisitTouch(
      visitor,
      touchFromParams({ contentId: "ra_last", at: lastAt }),
    );
    expect(visitor.firstTouch?.contentId).toBe("ra_first");
    expect(visitor.lastTouch?.contentId).toBe("ra_last");
    expect(isWithinAttributionWindow(firstAt)).toBe(true);
    expect(
      isWithinAttributionWindow(
        new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      ),
    ).toBe(false);
    expect(isRecentClerkSignup(Date.now())).toBe(true);
  });
});

describe("first success and stripe idempotency", () => {
  it("dedupes first job events", () => {
    resetRevenueAgentStoreForTests();
    const key = firstJobDedupeKey("user_1");
    expect(recordRevenueEvent({ eventName: "first_job_completed", dedupeKey: key, userId: "user_1", contentId: "ra_1" }).inserted).toBe(true);
    expect(recordRevenueEvent({ eventName: "first_job_completed", dedupeKey: key, userId: "user_1", contentId: "ra_1" }).inserted).toBe(false);
  });

  it("does not double-count invoice_paid on Stripe replay and keeps it distinct from subscription_started", async () => {
    resetRevenueAgentStoreForTests();
    upsertVisitorUserLink({
      visitorId: "vid_1",
      userId: "user_pay",
      linkedAt: new Date().toISOString(),
      attributedCampaignId: REVENUE_AGENT_CAMPAIGN_ID,
      attributedContentId: "ra_1",
      source: "x",
      medium: "social",
      firstTouchAt: new Date().toISOString(),
      lastTouchAt: new Date().toISOString(),
    });

    const invoice = {
      id: "in_1",
      amount_paid: 980,
      currency: "jpy",
    };
    await observeStripeRevenueEvent({
      eventId: "evt_invoice_1",
      eventType: "invoice.paid",
      livemode: false,
      userId: "user_pay",
      object: invoice,
    });
    await observeStripeRevenueEvent({
      eventId: "evt_invoice_1",
      eventType: "invoice.paid",
      livemode: false,
      userId: "user_pay",
      object: invoice,
    });
    await observeStripeRevenueEvent({
      eventId: "evt_sub_1",
      eventType: "customer.subscription.created",
      livemode: false,
      userId: "user_pay",
      object: { id: "sub_1" },
    });

    const events = listRevenueEvents();
    expect(events.filter((row) => row.eventName === "invoice_paid")).toHaveLength(1);
    expect(events.filter((row) => row.eventName === "subscription_started")).toHaveLength(1);
    expect(events.find((row) => row.eventName === "invoice_paid")?.metadata.amountYen).toBe(980);
    expect(invoicePaidDedupeKey("evt_invoice_1")).toBe("invoice_paid:evt_invoice_1");
  });
});

describe("dashboard honesty", () => {
  it("shows — when denominator is 0 or data is missing, never 0%", () => {
    expect(safeRate(1, 0)).toBeNull();
    expect(safeRate(null, 10)).toBeNull();
    expect(displayRate(null)).toBe("—");
    expect(displayMeasured(null)).toBe("—");
    expect(displayMeasured(0)).toBe("0");

    resetRevenueAgentStoreForTests();
    const totals = buildFunnelTotals({
      items: [item({ status: "published" })],
      events: [],
      costs: [],
      adSpendYen: null,
      range: "30d",
    });
    expect(totals.ctr).toBeNull();
    expect(totals.clickToSignupRate).toBeNull();
    expect(totals.signupToPaidRate).toBeNull();
    expect(totals.adSpendYen).toBeNull();
    expect(totals.roas).toBeNull();
    expect(totals.cashRevenueYen).toBeNull();
    expect(totals.signups).toBeNull();
  });

  it("does not convert unknown metrics to zero in content rows", () => {
    resetRevenueAgentStoreForTests();
    upsertRevenueItem(item({ id: "ra_unknown", contentId: "ra_unknown" }));
    const rows = buildContentRows({
      items: [item({ id: "ra_unknown", contentId: "ra_unknown" })],
      events: [],
      costs: [],
      range: "all",
    });
    expect(rows[0]?.clicks).toBeNull();
    expect(rows[0]?.signups).toBeNull();
    expect(rows[0]?.cashRevenueYen).toBeNull();
    expect(rows[0]?.verdict).toBe("hold");
    expect(rows[0]?.verdictLabel).toContain("データ不足");
  });
});

describe("edit requires re-approval", () => {
  it("moves approved copy back to pending_approval", async () => {
    resetRevenueAgentStoreForTests();
    resetRevenueAgentHydrationForTests();
    upsertRevenueItem(item({ id: "ra_edit", contentId: "ra_edit", status: "approved", xTweetId: null, publishedAt: null }));
    const next = await editRevenueItem("ra_edit", { title: "新しいタイトル" });
    expect(next.status).toBe("pending_approval");
    expect(canPublishNow(next)).toBe(false);
  });
});

describe("publish safety and owner access", () => {
  it("rejects rejected posts and allows approved posts", () => {
    expect(canPublishNow(item({ status: "rejected", xTweetId: null, publishedAt: null }))).toBe(false);
    expect(canPublishNow(item({ status: "approved", xTweetId: null, publishedAt: null }))).toBe(true);
    expect(canPublishNow(item({ status: "published", xTweetId: "1" }))).toBe(false);
  });

  it("keeps X publish idempotent via existing tweet id", () => {
    const published = item({ status: "published", xTweetId: "tw_1" });
    expect(canPublishNow(published)).toBe(false);
  });

  it("gates owner / member / anonymous", () => {
    expect(decideOwnerAccess({ userId: null, email: null }).status).toBe("unauthenticated");
    expect(
      decideOwnerAccess({ userId: "user_1", email: "member@example.com" }).status,
    ).toBe("forbidden");
  });
});

describe("learning priority", () => {
  it("ranks cash revenue above likes and does not invent a winner without data", () => {
    const withCash = scoreByRevenuePriority({
      revenueYen: 980,
      paidContracts: 1,
      firstSuccesses: 0,
      signups: 1,
      uniqueClicks: 2,
      engagement: 1,
    });
    const withLikes = scoreByRevenuePriority({
      revenueYen: null,
      paidContracts: null,
      firstSuccesses: null,
      signups: null,
      uniqueClicks: null,
      engagement: 99,
    });
    expect(withCash).not.toBeNull();
    expect(withLikes).not.toBeNull();
    expect(withCash!).toBeGreaterThan(withLikes!);
    expect(
      scoreByRevenuePriority({
        revenueYen: null,
        paidContracts: null,
        firstSuccesses: null,
        signups: null,
        uniqueClicks: null,
        engagement: null,
      }),
    ).toBeNull();
    expect(contentVerdict({
      clicks: null,
      signups: null,
      firstSuccesses: null,
      paidContracts: null,
      cashRevenueYen: null,
    }).label).toContain("データ不足");
  });
});

describe("attribution helper", () => {
  it("does not attach a user without a content touch", () => {
    expect(attributedContentForUser([], "user_none")).toBeNull();
    insertRevenueEvent({
      eventId: "evt_x",
      eventName: "signup_completed",
      occurredAt: new Date().toISOString(),
      anonymousVisitorId: null,
      userId: "user_none",
      campaignId: null,
      contentId: null,
      source: null,
      medium: null,
      dedupeKey: "signup:user_none",
      metadata: {},
    });
    expect(
      listRevenueEvents().find((row) => row.userId === "user_none")?.contentId,
    ).toBeNull();
  });
});
