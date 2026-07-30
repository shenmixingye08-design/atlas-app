import { beforeEach, describe, expect, it, vi } from "vitest";

const persistDomain = vi.fn(async () => "supabase");
const loadDomain = vi.fn(async () => null);
const prune = vi.fn(async () => ({ migrated: [], cleared: [] }));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: (...args: unknown[]) => persistDomain(...args),
  loadDurableDomain: (...args: unknown[]) => loadDomain(...args),
  pruneOversizedClerkDurableDomains: (...args: unknown[]) => prune(...args),
}));

import {
  isVercelEphemeralFs,
  persistWorkJob,
} from "./durable";

describe("work-jobs durable", () => {
  beforeEach(() => {
    persistDomain.mockClear();
    loadDomain.mockClear();
    prune.mockClear();
    persistDomain.mockResolvedValue("supabase");
    loadDomain.mockResolvedValue({ jobs: [] });
    vi.unstubAllEnvs();
  });

  it("detects Vercel ephemeral filesystem", () => {
    vi.stubEnv("VERCEL", "1");
    expect(isVercelEphemeralFs()).toBe(true);
  });

  it("persists to Supabase and does not treat disk as required on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const result = await persistWorkJob({
      id: "job_1",
      userId: "user_1",
      assignment: "画像を解析",
      idempotencyKey: "key",
      metadata: { jobId: "job_1" },
      status: "queued",
      attemptCount: 0,
      maxAttempts: 3,
      error: null,
      visionGate: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    });
    expect(result).toBe("supabase");
    expect(persistDomain).toHaveBeenCalledWith(
      "user_1",
      "atlasWorkJobs",
      expect.objectContaining({ jobs: expect.any(Array) }),
      expect.objectContaining({ forceSupabase: true }),
    );
  });

  it("returns failed when Supabase persist is skipped", async () => {
    vi.stubEnv("VERCEL", "1");
    persistDomain.mockResolvedValue("skipped");
    const result = await persistWorkJob({
      id: "job_2",
      userId: "user_1",
      assignment: "画像を解析",
      idempotencyKey: "key2",
      metadata: { jobId: "job_2" },
      status: "queued",
      attemptCount: 0,
      maxAttempts: 3,
      error: null,
      visionGate: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    });
    expect(result).toBe("failed");
  });
});
