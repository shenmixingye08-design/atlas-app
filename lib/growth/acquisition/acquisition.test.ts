import { describe, expect, it, beforeEach } from "vitest";

import { normalizeGrowthPath } from "@/lib/owner/revenue-agent/destinations";
import { readFileSync } from "node:fs";

import { classifyAcquisitionChannel } from "./channel-classify";
import { buildChannelRows } from "./channels";
import { containsPersonalFields, buildDiagnosisResult, isDiagnosisAnswers } from "./diagnosis";
import { resetAcquisitionHydrationForTests } from "./durable";
import { assertiveCopyAllowed, listEvidenceFacts, marketingFacts, setEvidenceStatus } from "./evidence";
import { buildMediaPack, markManualPublished, uniqueContentIds } from "./packs";
import { detectReferralAbuse, createReferralLink, claimReferral } from "./referral";
import {
  bindDiagnosisToUser,
  completeDiagnosis,
  recordDiagnosisFirstValueIfBound,
  recordDiagnosisPaidIfBound,
  startDiagnosis,
} from "./service";
import { listAcquisitionEvents, listPublishableStories, resetAcquisitionStoreForTests } from "./store";
import { canUseStoryInMarketing, recordStory } from "./stories";
import { listUseCasePages, publicUseCasePages, setUseCaseStatus } from "./usecases";
import { resolveCampaignVerdict } from "./verdicts";

describe("acquisition engine", () => {
  beforeEach(() => {
    resetAcquisitionHydrationForTests();
    resetAcquisitionStoreForTests();
  });

  it("completes diagnosis without personal fields and only real features", () => {
    expect(containsPersonalFields({ name: "太郎", answers: {} })).toBe(true);
    expect(containsPersonalFields({ email: "a@b.c" })).toBe(true);
    expect(containsPersonalFields({ company: "例" })).toBe(true);
    expect(
      containsPersonalFields({ action: "complete", answers: { repeatWork: "sns" } }),
    ).toBe(false);
    const result = buildDiagnosisResult({
      repeatWork: "sns",
      heaviest: "sns",
      tool: "x",
      frequency: "daily",
      firstCut: "sns",
    });
    expect(result.archetype).toBe("broadcast");
    expect(result.availableFeatures.join(" ")).toContain("X投稿案");
    expect(result.unavailable.join(" ")).toContain("PowerPoint");
    expect(result.availableFeatures.join(" ")).not.toContain("フォロワー購入");
    expect(
      isDiagnosisAnswers({
        repeatWork: "sns",
        heaviest: "sns",
        tool: "x",
        frequency: "daily",
        firstCut: "sns",
      }),
    ).toBe(true);
  });

  it("keeps UTM destination for the diagnosis path and does not invent unknown channels", () => {
    expect(normalizeGrowthPath("/tools/automation-diagnosis")).toBe(
      "/tools/automation-diagnosis",
    );
    expect(classifyAcquisitionChannel(null, null)).toBe("direct");
    expect(classifyAcquisitionChannel("maybe-ads", "cpc")).toBe("unknown");
    expect(classifyAcquisitionChannel("x", "social")).toBe("x");
    const unknownRow = buildChannelRows().find((row) => row.channel === "unknown");
    expect(unknownRow?.signups).toBeNull();
    expect(unknownRow?.cashYen).toBeNull();
  });

  it("does not treat unpublished use-case pages as indexed inventory", () => {
    expect(listUseCasePages().every((page) => page.status === "draft")).toBe(true);
    expect(publicUseCasePages()).toEqual([]);
    setUseCaseStatus("x-posts", "approved");
    expect(publicUseCasePages().map((page) => page.slug)).toEqual(["x-posts"]);
  });

  it("gives each media pack item a unique contentId and does not auto-post", () => {
    const pack = buildMediaPack("broadcast");
    expect(uniqueContentIds(pack)).toBe(true);
    expect(pack.items.some((item) => item.channel === "tiktok" && item.requiresPostUrl)).toBe(true);
    expect(pack.items.some((item) => item.channel === "youtube_shorts")).toBe(true);
    expect(pack.items.every((item) => item.autoPublish === false)).toBe(true);
    expect(pack.items.filter((item) => item.channel === "x").every((item) => item.canQueueToRevenueAgent)).toBe(
      true,
    );
    expect(markManualPublished({ postUrl: "" })).toEqual({ ok: false, reason: "missing_url" });
    expect(markManualPublished({ postUrl: "https://www.tiktok.com/@x/video/1" }).ok).toBe(true);
    expect(markManualPublished({ postUrl: "https://x.com/a/status/1", status: "rejected" })).toEqual({
      ok: false,
      reason: "rejected",
    });
    expect(
      markManualPublished({ postUrl: "https://x.com/a/status/1", autoPublish: true, mediaLinked: false }),
    ).toEqual({ ok: false, reason: "unlinked" });
  });

  it("blocks self-referral, duplicate registration, and does not grant rewards", () => {
    const record = createReferralLink("user_a");
    expect(detectReferralAbuse({ referralId: record.referralId, visitorUserId: "user_a" })).toEqual({
      ok: false,
      reason: "self_referral",
    });
    expect(detectReferralAbuse({ referralId: "missing", visitorUserId: "user_b" }).ok).toBe(false);
    expect(detectReferralAbuse({ referralId: record.referralId, visitorUserId: "user_b" }).ok).toBe(true);
    expect(claimReferral(record.referralId, "user_b").ok).toBe(true);
    expect(claimReferral(record.referralId, "user_b")).toEqual({
      ok: false,
      reason: "duplicate_registration",
    });
    expect(createReferralLink("user_a").referralId).toBe(record.referralId);
  });

  it("hides unpublished stories from marketing", () => {
    expect(canUseStoryInMarketing("ops_only", true)).toBe(false);
    expect(canUseStoryInMarketing("anonymous_ok", false)).toBe(false);
    expect(canUseStoryInMarketing("anonymous_ok", true)).toBe(true);
    recordStory({
      userId: "u1",
      usedFor: "X投稿",
      helpful: "下書きが早い",
      improve: "なし",
      consent: "ops_only",
    });
    expect(listPublishableStories()).toEqual([]);
  });

  it("does not declare a campaign winner without samples", () => {
    expect(
      resolveCampaignVerdict({
        days: 3,
        uniqueClicks: 2,
        signups: 1,
        firstSuccess: 0,
        paid: 0,
        cashYen: null,
      }),
    ).toBe("insufficient_data");
    expect(
      resolveCampaignVerdict({
        days: 20,
        uniqueClicks: 40,
        signups: null,
        firstSuccess: null,
        paid: null,
        cashYen: null,
      }),
    ).toBe("insufficient_data");
  });

  it("does not allow assertive ads from unverified evidence", () => {
    expect(listEvidenceFacts().some((row) => row.status === "approved_for_marketing")).toBe(false);
    expect(marketingFacts()).toEqual([]);
    expect(assertiveCopyAllowed("unverified")).toBe(false);
    expect(assertiveCopyAllowed("approved_for_marketing")).toBe(true);
    setEvidenceStatus("sns_draft", "approved_for_marketing");
    expect(marketingFacts()[0]?.id).toBe("sns_draft");
  });

  it("keeps Owner acquisition APIs behind Owner access", () => {
    const source = readFileSync("app/api/owner/acquisition/route.ts", "utf8");
    expect(source).toContain("requireAtlasOwnerApi");
    const page = readFileSync("app/owner/acquisition/page.tsx", "utf8");
    expect(page).toContain("requireAtlasOwner");
    const diagnosisPage = readFileSync("app/tools/automation-diagnosis/page.tsx", "utf8");
    expect(diagnosisPage).not.toContain("auth()");
    expect(readFileSync("lib/auth/public-routes.ts", "utf8")).toContain("/tools");
  });

  it("binds diagnosis after signup and does not attribute organic users", async () => {
    const started = await startDiagnosis({
      visitorId: "vid_diag",
      campaignId: "minervot_owner_growth",
      contentId: "ac_test_x",
      source: "x",
      medium: "social",
    });
    const completed = await completeDiagnosis({
      visitorId: "vid_diag",
      sessionId: started.sessionId,
      answers: {
        repeatWork: "sns",
        heaviest: "sns",
        tool: "x",
        frequency: "daily",
        firstCut: "sns",
      },
      extra: { action: "complete" },
      campaignId: "minervot_owner_growth",
      contentId: "ac_test_x",
      source: "x",
      medium: "social",
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    const bound = await bindDiagnosisToUser({
      userId: "user_diag",
      visitorId: "vid_diag",
      sessionId: started.sessionId,
    });
    expect(bound?.result?.firstJob).toBe("sns");
    expect(
      listAcquisitionEvents().filter((event) => event.eventName === "diagnosis_signup_completed"),
    ).toHaveLength(1);

    const organic = await bindDiagnosisToUser({
      userId: "user_organic",
      visitorId: "vid_organic",
    });
    expect(organic).toBeNull();
    expect(
      listAcquisitionEvents().filter(
        (event) => event.eventName === "diagnosis_signup_completed" && event.userId === "user_organic",
      ),
    ).toHaveLength(0);

    await bindDiagnosisToUser({
      userId: "user_diag",
      visitorId: "vid_diag",
      sessionId: started.sessionId,
    });
    expect(
      listAcquisitionEvents().filter((event) => event.eventName === "diagnosis_signup_completed"),
    ).toHaveLength(1);

    const first = await recordDiagnosisFirstValueIfBound("user_diag");
    expect(first.inserted).toBe(true);
    const paid = await recordDiagnosisPaidIfBound("user_diag");
    expect(paid.inserted).toBe(true);
    const organicPaid = await recordDiagnosisPaidIfBound("user_organic");
    expect(organicPaid.skipped).toBe(true);
    expect(
      listAcquisitionEvents().find((event) => event.eventName === "diagnosis_paid_conversion")
        ?.contentId,
    ).toBe("ac_test_x");
  });

  it("rejects personal keys on complete and keeps diagnosis events unguessed as 0", async () => {
    const started = await startDiagnosis({
      visitorId: "vid_2",
      campaignId: null,
      contentId: null,
      source: null,
      medium: null,
    });
    const rejected = await completeDiagnosis({
      visitorId: "vid_2",
      sessionId: started.sessionId,
      answers: {
        repeatWork: "sns",
        heaviest: "sns",
        tool: "x",
        frequency: "daily",
        firstCut: "sns",
      },
      extra: { name: "花子" },
      campaignId: null,
      contentId: null,
      source: null,
      medium: null,
    });
    expect(rejected).toEqual({
      ok: false,
      error: "個人情報は送信しないでください",
      status: 400,
    });
    const rows = buildChannelRows();
    expect(rows.find((row) => row.channel === "tiktok")?.cashYen).toBeNull();
    expect(rows.find((row) => row.channel === "unknown")?.uniqueClicks).toBeNull();
  });
});
