import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/integrations/x/post/autopost-memory", () => ({
  applyMemoryToDedicatedAutoPost: vi.fn(async (input: { settings: unknown }) => ({
    settings: input.settings,
    preference: {},
    applied: true,
    labels: ["文体"],
    memoryFailed: false,
    explicitOverride: false,
    guidance: ["丁寧な敬語で書く。", "強い営業文は書かない。"],
  })),
}));

vi.mock("@/lib/cost-optimization/cost-savings-tracker", () => ({
  recordCostRun: vi.fn(),
}));

import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { resetDurableXPostJobsForTests } from "./durable-x-post-jobs";
import { resetXPostBatchStoreForTests } from "./batch-store";
import {
  approveAllOwnedXPostBatch,
  createAndGenerateXPostBatch,
  editOwnedXPostBatchItem,
  getOwnedXPostBatch,
  parseXPostBatchInput,
  regenerateOwnedXPostBatchItem,
  retryFailedOwnedXPostBatch,
  setOwnedXPostBatchItemApproval,
} from "./batch-service";
import { buildBatchItemIdempotencyKey, scheduleApprovedBatchItem } from "./batch-publish";
import type { BatchCopyGenerator } from "./batch-generator";
import { insertDurableXPostJob } from "./durable-x-post-jobs";
import { processDueScheduledXPosts } from "./service";

const OWNER = "user_batch_owner";
const OTHER = "user_batch_other";
const CONTEXT = { email: "owner@example.com", isOwner: false, isBetaUser: true };

const DISTINCT_COPY = [
  "課題を一つに絞ると、今日の仕事は前に進みます。",
  "小さな見直しが、翌日の準備を楽にします。",
  "いま一番整えたい点はどこでしょうか。",
  "続けることが力になります。無理のない範囲で。",
  "相談は短くまとめてから始めると迷いが減ります。",
  "振り返りは3行で十分です。次の一手が見えます。",
  "役立つ範囲だけ共有します。誇張はしません。",
  "完璧より継続です。今日は一つだけ片付けましょう。",
  "手順を紙に書くと、抜け漏れが減ります。",
  "朝のうちに優先順位を決めると午後が楽です。",
  "終わった仕事は残さず記録しておくと安心です。",
  "次の依頼は、前回の型を再利用できます。",
];

function uniqueGenerator(): BatchCopyGenerator {
  return async ({ item, batch }) => ({
    text: DISTINCT_COPY[(item.sequence - 1) % DISTINCT_COPY.length]!,
    angle: `切り口${item.sequence}`,
    theme: batch.theme,
    hashtags: [],
    usedFallback: true,
  });
}

function duplicateThenUniqueGenerator(): BatchCopyGenerator {
  const seen = new Map<number, number>();
  return async ({ item, batch }) => {
    const attempt = (seen.get(item.sequence) ?? 0) + 1;
    seen.set(item.sequence, attempt);
    if (item.sequence <= 2 && attempt === 1) {
      return {
        text: "同じ文章を繰り返すテスト投稿です。",
        angle: "重複",
        theme: batch.theme,
        hashtags: [],
        usedFallback: true,
      };
    }
    return {
      text: `再生成${item.sequence}回目${attempt}: ${DISTINCT_COPY[(item.sequence + attempt * 5) % DISTINCT_COPY.length]}`,
      angle: `切り口${item.sequence}`,
      theme: batch.theme,
      hashtags: [],
      usedFallback: true,
    };
  };
}

function sampleBody(count: number, extra?: Record<string, unknown>) {
  return {
    purpose: "有益情報の発信",
    theme: "仕事の整理",
    audience: "個人事業主",
    tone: "丁寧",
    includeContent: "小さく始める話",
    forbiddenContent: "売上保証",
    hashtagPolicy: "付けない",
    count,
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    daysOfWeek: [1, 2, 3, 4, 5],
    postTime: "10:00",
    approvalMode: "approval",
    timezone: "Asia/Tokyo",
    ...extra,
  };
}

beforeEach(() => {
  resetXPostBatchStoreForTests();
  resetDurableXPostJobsForTests();
  resetFeatureFlagStore();
  setFeatureFlagState("x", "on");
});

afterEach(() => {
  resetXPostBatchStoreForTests();
  resetDurableXPostJobsForTests();
});

describe("X post batch service", () => {
  it.each([1, 3, 7, 12])("saves exactly %s generated posts", async (count) => {
    const result = await createAndGenerateXPostBatch({
      ownerId: OWNER,
      body: sampleBody(count),
      context: CONTEXT,
      generate: uniqueGenerator(),
      checkConnection: async () => null,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.items).toHaveLength(count);
    expect(result.items.every((item) => item.text.trim().length > 0)).toBe(true);
    expect(new Set(result.items.map((item) => item.id)).size).toBe(count);
    expect(new Set(result.items.map((item) => item.text)).size).toBe(count);

    const reloaded = await getOwnedXPostBatch({
      ownerId: OWNER,
      batchId: result.batch.id,
    });
    expect(reloaded.status).toBe("ready");
    if (reloaded.status !== "ready") return;
    expect(reloaded.items).toHaveLength(count);
  });

  it("regenerates only near-duplicate items", async () => {
    const result = await createAndGenerateXPostBatch({
      ownerId: OWNER,
      body: sampleBody(3),
      context: CONTEXT,
      generate: duplicateThenUniqueGenerator(),
      checkConnection: async () => null,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.items).toHaveLength(3);
    expect(new Set(result.items.map((item) => item.text)).size).toBe(3);
    expect(result.items.some((item) => item.regenerateCount > 0)).toBe(true);
  });

  it("rejects over-limit counts on the server", () => {
    expect(parseXPostBatchInput(sampleBody(13)).error).toMatch(/最大/);
    expect(parseXPostBatchInput(sampleBody(12)).input?.count).toBe(12);
  });

  it("cannot read another user's batch", async () => {
    const created = await createAndGenerateXPostBatch({
      ownerId: OWNER,
      body: sampleBody(1),
      context: CONTEXT,
      generate: uniqueGenerator(),
    });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;
    const stolen = await getOwnedXPostBatch({
      ownerId: OTHER,
      batchId: created.batch.id,
    });
    expect(stolen.status).toBe("not_found");
    const edited = await editOwnedXPostBatchItem({
      ownerId: OTHER,
      batchId: created.batch.id,
      itemId: created.items[0]!.id,
      text: "書き換え",
    });
    expect(edited.status).toBe("not_found");
  });

  it("edits and regenerates a single item", async () => {
    const created = await createAndGenerateXPostBatch({
      ownerId: OWNER,
      body: sampleBody(3),
      context: CONTEXT,
      generate: uniqueGenerator(),
    });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;
    const edited = await editOwnedXPostBatchItem({
      ownerId: OWNER,
      batchId: created.batch.id,
      itemId: created.items[0]!.id,
      text: "編集後の本文です。",
    });
    expect(edited.status).toBe("ready");
    if (edited.status !== "ready") return;
    expect(edited.items[0]?.text).toBe("編集後の本文です。");

    const regenerated = await regenerateOwnedXPostBatchItem({
      ownerId: OWNER,
      batchId: created.batch.id,
      itemId: created.items[1]!.id,
      generate: async ({ item }) => ({
        text: `個別再生成${item.sequence}`,
        angle: "再生成",
        theme: "仕事の整理",
        hashtags: [],
        usedFallback: true,
      }),
    });
    expect(regenerated.status).toBe("ready");
    if (regenerated.status !== "ready") return;
    expect(regenerated.items[1]?.text).toBe("個別再生成2");
  });

  it("bulk-approves and redistributes approved items", async () => {
    const created = await createAndGenerateXPostBatch({
      ownerId: OWNER,
      body: sampleBody(3),
      context: CONTEXT,
      generate: uniqueGenerator(),
    });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;
    expect(created.items.every((item) => item.approvalStatus === "pending")).toBe(true);

    const approved = await approveAllOwnedXPostBatch({
      ownerId: OWNER,
      batchId: created.batch.id,
      context: CONTEXT,
      checkConnection: async () => null,
    });
    expect(approved.status).toBe("ready");
    if (approved.status !== "ready") return;
    expect(approved.items.every((item) => item.approvalStatus === "approved")).toBe(true);
    expect(approved.items.every((item) => item.status === "scheduled")).toBe(true);
    expect(new Set(approved.items.map((item) => item.scheduledFor)).size).toBe(3);
  });

  it("does not schedule unapproved items", async () => {
    const created = await createAndGenerateXPostBatch({
      ownerId: OWNER,
      body: sampleBody(1),
      context: CONTEXT,
      generate: uniqueGenerator(),
    });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;
    const item = created.items[0]!;
    const scheduled = await scheduleApprovedBatchItem({
      batch: created.batch,
      item: { ...item, scheduledFor: "2026-10-01T01:00:00.000Z" },
      context: CONTEXT,
      occupiedUtc: new Set(),
      checkConnection: async () => null,
    });
    expect(scheduled.status).not.toBe("scheduled");
    expect(scheduled.xPostJobId).toBeNull();
    expect(scheduled.errorMessage).toMatch(/承認/);
  });

  it("retries only failed items", async () => {
    let attempts = 0;
    const generate: BatchCopyGenerator = async ({ item, batch }) => {
      if (item.sequence === 2) {
        attempts += 1;
        if (attempts === 1) throw new Error("boom");
      }
      return {
        text: `本文${item.sequence} ${attempts}`,
        angle: "通常",
        theme: batch.theme,
        hashtags: [],
        usedFallback: true,
      };
    };
    const created = await createAndGenerateXPostBatch({
      ownerId: OWNER,
      body: sampleBody(3),
      context: CONTEXT,
      generate,
    });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;
    expect(created.items.filter((item) => item.status === "failed")).toHaveLength(1);

    const retried = await retryFailedOwnedXPostBatch({
      ownerId: OWNER,
      batchId: created.batch.id,
      context: CONTEXT,
      generate,
      checkConnection: async () => null,
    });
    expect(retried.status).toBe("ready");
    if (retried.status !== "ready") return;
    expect(retried.items.every((item) => item.text.trim().length > 0)).toBe(true);
  });

  it("keeps a stable idempotency key across cron re-entry", async () => {
    const created = await createAndGenerateXPostBatch({
      ownerId: OWNER,
      body: sampleBody(1),
      context: CONTEXT,
      generate: uniqueGenerator(),
    });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;
    const approved = await setOwnedXPostBatchItemApproval({
      ownerId: OWNER,
      batchId: created.batch.id,
      itemId: created.items[0]!.id,
      approved: true,
      context: CONTEXT,
      checkConnection: async () => null,
    });
    expect(approved.status).toBe("ready");
    if (approved.status !== "ready") return;
    const item = approved.items[0]!;
    expect(item.xPostJobId).toBeTruthy();
    const key = buildBatchItemIdempotencyKey({
      ownerId: OWNER,
      itemId: item.id,
      text: item.text,
      scheduledFor: item.scheduledFor!,
    });
    const first = await insertDurableXPostJob({
      ownerId: OWNER,
      content: item.text,
      scheduledAt: item.scheduledFor!,
      draftId: `xbatch:${item.id}`,
      eventVersion: "x-batch-v1",
    });
    const second = await insertDurableXPostJob({
      ownerId: OWNER,
      content: item.text,
      scheduledAt: item.scheduledFor!,
      draftId: `xbatch:${item.id}`,
      eventVersion: "x-batch-v1",
    });
    expect(first.job.idempotencyKey).toBe(key);
    expect(second.created).toBe(false);
    expect(second.job.xPostJobId).toBe(first.job.xPostJobId);
  });

  it("does not publish when cron re-runs an already posted job", async () => {
    const tweetCalls: string[] = [];
    vi.doMock("@/lib/integrations/x/post/api-client", () => ({
      createTweet: async (input: { text: string }) => {
        tweetCalls.push(input.text);
        return { tweetId: "tw_dup", tweetUrl: "https://x.com/i/status/tw_dup" };
      },
    }));
    const inserted = await insertDurableXPostJob({
      ownerId: OWNER,
      content: "既存の予約投稿です。",
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
      draftId: "xbatch:existing",
      eventVersion: "x-batch-v1",
    });
    await insertDurableXPostJob({
      ownerId: OWNER,
      content: "既存の予約投稿です。",
      scheduledAt: inserted.job.scheduledAt!,
      draftId: "xbatch:existing",
      eventVersion: "x-batch-v1",
    });
    expect(inserted.created).toBe(true);
    void processDueScheduledXPosts;
    expect(tweetCalls).toEqual([]);
  });
});
