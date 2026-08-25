import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyCommon } from "./compose";
import { resetDeliverableBatchStoreForTests } from "./store";

vi.mock("./durable", () => ({
  ensureDeliverableBatchesHydrated: async () => undefined,
  persistDeliverableBatchesNow: async () => undefined,
  resetDeliverableBatchHydrationForTests: () => undefined,
}));

vi.mock("./table", () => ({
  upsertDeliverableBatchRow: async () => undefined,
  upsertDeliverableBatchItemRow: async () => undefined,
  deleteDeliverableBatchItemRow: async () => undefined,
  loadDeliverableBatchRows: async () => null,
}));

const generate = vi.fn();
vi.mock("./generate", () => ({
  generateDeliverableBatchItemArtifact: (...args: unknown[]) => generate(...args),
}));

describe("deliverable batch service", () => {
  beforeEach(() => {
    resetDeliverableBatchStoreForTests();
    generate.mockReset();
    generate.mockImplementation(
      async ({ item }: { item: { id: string; title: string; order: number } }) => ({
        ok: true,
        artifactId: `art_${item.id}`,
        fileName: `${item.title}.txt`,
        sourceContent: [
          `UNIQUE_${item.id}`,
          `題名:${item.title}`,
          `順番:${item.order}`,
          `${item.title}だけの本文。他の商品の価格や実績は使いません。`,
          item.id,
        ].join("\n"),
      }),
    );
  });

  it("creates from line list, samples first item, then remaining without regenerating sample", async () => {
    const { createDeliverableBatch, generateDeliverableBatchSample, generateDeliverableBatchRemaining } =
      await import("./service");
    const created = await createDeliverableBatch("user_a", {
      inputType: "line_list",
      common: emptyCommon(),
      format: "txt",
      requestedCount: 3,
      sharedInstruction: "商品説明",
      lines: ["商品A", "商品B", "商品C"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const sample = await generateDeliverableBatchSample("user_a", created.view.batch.id, "http://local");
    expect(sample?.items[0]?.status).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(1);
    await generateDeliverableBatchRemaining("user_a", created.view.batch.id, "http://local", {
      approveSample: true,
    });
    expect(generate).toHaveBeenCalledTimes(3);
    const ids = generate.mock.calls.map((call) => call[0].item.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("does not retry successful items and retries only failed", async () => {
    const {
      createDeliverableBatch,
      generateDeliverableBatchRemaining,
      retryFailedDeliverableBatchItems,
    } = await import("./service");
    generate.mockImplementationOnce(
      async ({ item }: { item: { id: string; title: string; order: number } }) => ({
        ok: true,
        artifactId: `art_${item.id}`,
        fileName: `${item.title}.txt`,
        sourceContent: `成功A ${item.id} ${item.order} ${item.title}`,
      }),
    );
    generate.mockImplementationOnce(async () => ({
      ok: false,
      error: "一時失敗",
    }));
    generate.mockImplementationOnce(
      async ({ item }: { item: { id: string; title: string; order: number } }) => ({
        ok: true,
        artifactId: `art_${item.id}`,
        fileName: `${item.title}.txt`,
        sourceContent: `成功C ${item.id} ${item.order} ${item.title}`,
      }),
    );
    const created = await createDeliverableBatch("user_b", {
      inputType: "line_list",
      common: emptyCommon(),
      format: "txt",
      requestedCount: 3,
      sharedInstruction: "x",
      lines: ["A", "B", "C"],
    });
    if (!created.ok) throw new Error(created.error);
    const after = await generateDeliverableBatchRemaining("user_b", created.view.batch.id, "http://local");
    expect(after?.batch.status).toBe("partially_failed");
    expect(after?.items.filter((item) => item.status === "ready")).toHaveLength(2);
    const callsBeforeRetry = generate.mock.calls.length;
    generate.mockImplementation(
      async ({ item }: { item: { id: string; title: string; order: number } }) => ({
        ok: true,
        artifactId: `art_${item.id}`,
        fileName: `${item.title}.txt`,
        sourceContent: `再試行 ${item.id} ${item.order} ${item.title}`,
      }),
    );
    const retried = await retryFailedDeliverableBatchItems("user_b", created.view.batch.id, "http://local");
    expect(generate.mock.calls.length).toBe(callsBeforeRetry + 1);
    expect(retried?.items.every((item) => item.status === "ready")).toBe(true);
  });

  it("cancels pending items and isolates users", async () => {
    const { createDeliverableBatch, cancelDeliverableBatch, getDeliverableBatchView } =
      await import("./service");
    const created = await createDeliverableBatch("user_c", {
      inputType: "ai_themes",
      common: emptyCommon(),
      format: "txt",
      requestedCount: 5,
      sharedInstruction: "太陽光施工会社のSNS投稿を5本作る",
    });
    if (!created.ok) throw new Error(created.error);
    const cancelled = await cancelDeliverableBatch("user_c", created.view.batch.id);
    expect(cancelled?.batch.status).toBe("cancelled");
    expect(await getDeliverableBatchView("user_other", created.view.batch.id)).toBeNull();
  });

  it("rejects counts outside the allow-list", async () => {
    const { createDeliverableBatch } = await import("./service");
    const created = await createDeliverableBatch("user_d", {
      inputType: "ai_themes",
      common: emptyCommon(),
      format: "txt",
      requestedCount: 4,
      sharedInstruction: "x",
    });
    expect(created.ok).toBe(false);
  });
});
