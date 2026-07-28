import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/emitters", () => ({
  notifyWorkCompleted: vi.fn(),
  notifyWorkFailed: vi.fn(),
}));
vi.mock("@/lib/notifications/durable", () => ({
  persistNotificationsNow: vi.fn(async () => undefined),
}));

import { runWordPipelineSmoke } from "./word-pipeline-smoke";
import { resetDurableDeliverableStoreForTests } from "./durable-store";
import { resetWordJobsForTests } from "./word-job-stages";

describe("word pipeline smoke", () => {
  beforeEach(() => {
    resetDurableDeliverableStoreForTests();
    resetWordJobsForTests();
    vi.stubEnv("ATLAS_DELIVERABLE_STORAGE", "local");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("generates a downloadable PK-headed docx without OpenAI", async () => {
    const result = await runWordPipelineSmoke({
      requestOrigin: "http://localhost:3000",
    });
    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.stage).toBe("completed");
    expect(result.hasPkHeader).toBe(true);
    expect(result.deliverableId).toBeTruthy();
    expect(result.downloadUrl).toContain("/api/deliverables/");
    expect(result.sizeBytes ?? 0).toBeGreaterThan(1500);
  }, 30_000);
});
