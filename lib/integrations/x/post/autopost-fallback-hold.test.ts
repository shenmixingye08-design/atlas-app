import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const postTweet = vi.fn();
const saveDraft = vi.fn();
const notifyDrafted = vi.fn();
const notifyHeld = vi.fn();
const notifyLimit = vi.fn();
const billingDenial = { value: null as string | null };
const recentRuns = { value: [] as unknown[] };

vi.mock("@/lib/billing/access", () => ({
  evaluateBillingFeature: async () => ({ denial: null }),
  evaluateBillingSnsPost: async () => ({ denial: billingDenial.value }),
}));
vi.mock("@/lib/notifications/emitters", () => ({
  notifyXAutoPostDrafted: (...a: unknown[]) => notifyDrafted(...a),
  notifyXAutoPostHeldForReview: (...a: unknown[]) => notifyHeld(...a),
  notifyXAutoPostLimitReached: (...a: unknown[]) => notifyLimit(...a),
  notifyXPostFailed: vi.fn(),
}));
vi.mock("./autopost-memory", () => ({
  applyMemoryToDedicatedAutoPost: async ({ settings }: { settings: unknown }) => ({
    settings,
    guidance: [],
    preference: { hashtagsMax: null },
    applied: false,
    memoryFailed: false,
  }),
}));
vi.mock("./autopost-generator", () => ({
  generateAutoPostText: (...a: unknown[]) => generate(...a),
  isTooSimilar: () => false,
  selectPostType: () => "knowhow",
}));
vi.mock("./autopost-schedule", () => ({
  computeDueSlots: () => [{ slotKey: "2026-09-29T18:00", scheduledFor: "2026-09-29T09:00:00.000Z" }],
}));
vi.mock("./autopost-settings-store", () => ({
  listEnabledXAutoPostSettings: async () => [],
  loadXAutoPostSettings: async () => null,
}));
vi.mock("./autopost-runs-store", () => ({
  claimXAutoPostSlot: async () => ({ claimed: true, run: { id: "run1" } }),
  listXAutoPostRuns: async () => recentRuns.value,
  updateXAutoPostRun: async () => undefined,
}));
vi.mock("./service", () => ({
  postTweetAutoForUser: (...a: unknown[]) => postTweet(...a),
  saveXDraftForUser: (...a: unknown[]) => saveDraft(...a),
}));

import { runDueAutoPostsForUser } from "./autopost-runner";
import type { XAutoPostSettings } from "./autopost-types";

const settings = (mode: XAutoPostSettings["mode"]): XAutoPostSettings => ({
  userId: "u1",
  enabled: true,
  mode,
  purpose: "",
  themes: ["美容室の集客"],
  audience: "",
  tone: "",
  frequency: "daily_1",
  daysOfWeek: [],
  postTimes: ["18:00"],
  timezone: "Asia/Tokyo",
  includeHashtags: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
});

describe("full-auto X post with fallback copy", () => {
  beforeEach(() => {
    generate.mockReset();
    postTweet.mockReset();
    saveDraft.mockReset();
    notifyDrafted.mockReset();
    notifyHeld.mockReset();
    notifyLimit.mockReset();
    billingDenial.value = null;
    recentRuns.value = [];
    saveDraft.mockResolvedValue({ status: "ready" });
    postTweet.mockResolvedValue({ status: "ready", history: { status: "success", tweetId: "1" } });
  });

  it("holds template fallback as a draft instead of posting", async () => {
    generate.mockResolvedValue({ text: "美容室の集客は、続けることが一番の近道です。", postType: "knowhow", usedFallback: true });
    const out = await runDueAutoPostsForUser({ settings: settings("full_auto"), context: {} as never });
    expect(out.slots[0]!.status).toBe("drafted");
    expect(postTweet).not.toHaveBeenCalled();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(notifyHeld).toHaveBeenCalledWith("u1");
    expect(notifyDrafted).not.toHaveBeenCalled();
  });

  it("still posts real AI copy in full-auto mode", async () => {
    generate.mockResolvedValue({ text: "予約が埋まる美容室は最初の一文が違います。", postType: "knowhow", usedFallback: false });
    await runDueAutoPostsForUser({ settings: settings("full_auto"), context: {} as never });
    expect(postTweet).toHaveBeenCalledTimes(1);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("keeps approval mode unchanged (draft + normal review notice)", async () => {
    generate.mockResolvedValue({ text: "本文", postType: "knowhow", usedFallback: false });
    await runDueAutoPostsForUser({ settings: settings("approval"), context: {} as never });
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(notifyDrafted).toHaveBeenCalledWith("u1");
    expect(notifyHeld).not.toHaveBeenCalled();
  });
});

describe("plan limit reached on a scheduled X post", () => {
  const now = new Date("2026-09-29T10:00:00.000Z");

  beforeEach(() => {
    generate.mockReset();
    notifyLimit.mockReset();
    billingDenial.value = "limit";
    recentRuns.value = [];
  });

  it("skips without AI spend and tells the user once this month", async () => {
    const out = await runDueAutoPostsForUser({ settings: settings("full_auto"), context: {} as never, now });
    expect(out.slots[0]!.reason).toBe("billing");
    expect(generate).not.toHaveBeenCalled();
    expect(notifyLimit).toHaveBeenCalledWith("u1");
  });

  it("does not repeat the notice when this month already had a limit skip", async () => {
    recentRuns.value = [
      { status: "skipped", errorMessage: "投稿上限", createdAt: "2026-09-20T10:00:00.000Z", text: null },
    ];
    await runDueAutoPostsForUser({ settings: settings("full_auto"), context: {} as never, now });
    expect(notifyLimit).not.toHaveBeenCalled();
  });

  it("notifies again in a new month", async () => {
    recentRuns.value = [
      { status: "skipped", errorMessage: "投稿上限", createdAt: "2026-08-20T10:00:00.000Z", text: null },
    ];
    await runDueAutoPostsForUser({ settings: settings("full_auto"), context: {} as never, now });
    expect(notifyLimit).toHaveBeenCalledTimes(1);
  });
});
