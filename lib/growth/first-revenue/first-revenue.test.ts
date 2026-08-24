import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";

import { normalizeGrowthPath } from "@/lib/owner/revenue-agent/destinations";

import { FIRST_OFFER_PATH } from "./constants";
import { resetFirstRevenueHydrationForTests } from "./durable";
import { firstOfferCopy, offerSignupHref } from "./offer";
import { buildSprintPosts, uniqueSprintContentIds } from "./posts";
import {
  bindOfferToUser,
  getOwnerSprintSnapshot,
  markManualPost,
  recordOfferEvent,
} from "./service";

describe("first revenue sprint", () => {
  beforeEach(() => {
    resetFirstRevenueHydrationForTests();
  });

  it("sells only the X draft job with existing Light price", () => {
    const copy = firstOfferCopy();
    expect(copy.product).toBe("X投稿案の作成");
    expect(copy.recommendedPriceJpy).toBe(980);
    expect(copy.availableNow.join(" ")).toContain("投稿文");
    expect(copy.availableNow.join(" ")).not.toContain("PowerPoint");
    expect(copy.unavailable.join(" ")).toContain("フォロワー");
    expect(decodeURIComponent(offerSignupHref())).toContain("offer=sns");
    expect(offerSignupHref()).toContain(copy.contentId);
    expect(normalizeGrowthPath(FIRST_OFFER_PATH)).toBe(FIRST_OFFER_PATH);
  });

  it("does not attribute organic signup or test cash as live revenue", async () => {
    expect(await bindOfferToUser({ userId: "organic", visitorId: "vid_org" })).toBe(false);
    await recordOfferEvent({
      eventName: "offer_lp_viewed",
      visitorId: "vid_offer",
      contentId: "fr_lp_x_posts",
    });
    expect(await bindOfferToUser({ userId: "buyer", visitorId: "vid_offer" })).toBe(true);
    await recordOfferEvent({ eventName: "first_use_started", userId: "buyer" });
    await recordOfferEvent({ eventName: "first_use_failed", userId: "buyer" });
    await recordOfferEvent({
      eventName: "invoice_paid",
      userId: "buyer",
      livemode: false,
      amountYen: 980,
    });
    const snapshot = await getOwnerSprintSnapshot();
    expect(snapshot.counts.signup_completed).toBe(1);
    expect(snapshot.counts.first_use_succeeded).toBeNull();
    expect(snapshot.counts.first_use_failed).toBe(1);
    expect(snapshot.liveCashYen).toBeNull();
    expect(snapshot.goals.liveCash).toBe("unmet");
    expect(snapshot.lpStatus).toBe("draft");
  });

  it("counts live invoice.paid only when livemode is true", async () => {
    await recordOfferEvent({ eventName: "offer_lp_viewed", visitorId: "vid_live" });
    await bindOfferToUser({ userId: "live_user", visitorId: "vid_live" });
    await recordOfferEvent({
      eventName: "invoice_paid",
      userId: "live_user",
      livemode: true,
      amountYen: 980,
    });
    const snapshot = await getOwnerSprintSnapshot();
    expect(snapshot.liveCashYen).toBe(980);
    expect(snapshot.goals.liveCash).toBe("met");
  });

  it("builds 14 unique posts and rejects publish without URL", async () => {
    const posts = buildSprintPosts();
    expect(posts).toHaveLength(14);
    expect(uniqueSprintContentIds(posts)).toBe(true);
    expect(posts.filter((post) => post.kind === "pain")).toHaveLength(3);
    expect(posts.every((post) => post.actualFeature.includes("投稿文"))).toBe(true);
    expect(posts.every((post) => post.prohibitedClaimCheck.includes("フォロワー"))).toBe(true);
    expect(await markManualPost(posts[0].contentId, "")).toEqual({
      ok: false,
      error: "投稿URLがないため成功扱いしません",
    });
  });

  it("keeps Owner APIs behind Owner access and LP public", () => {
    expect(readFileSync("app/api/owner/first-revenue/route.ts", "utf8")).toContain(
      "requireAtlasOwnerApi",
    );
    expect(readFileSync("app/use-cases/first-offer/page.tsx", "utf8")).not.toContain("auth()");
    expect(readFileSync("lib/auth/public-routes.ts", "utf8")).toContain("/use-cases");
  });
});
