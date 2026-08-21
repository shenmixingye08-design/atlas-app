import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  loadDurableDomain,
  persistDurableDomain,
  pruneOversizedClerkDurableDomains,
} from "@/lib/persistence/durable-domain";

type PersistDomainMock = (
  userId: Parameters<typeof persistDurableDomain>[0],
  domainKey: Parameters<typeof persistDurableDomain>[1],
  payload: unknown,
  options: unknown,
) => ReturnType<typeof persistDurableDomain<unknown>>;

const persistDomain = vi.fn<PersistDomainMock>(async () => "supabase");
const loadDomain = vi.fn<typeof loadDurableDomain>(async () => null);
const prune = vi.fn<typeof pruneOversizedClerkDurableDomains>(
  async () => ({ migrated: [], cleared: [] }),
);

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: <T,>(
    ...args: Parameters<typeof persistDurableDomain<T>>
  ) => persistDomain(...args) as ReturnType<typeof persistDurableDomain<T>>,
  loadDurableDomain: <T,>(...args: Parameters<typeof loadDurableDomain>) =>
    loadDomain(...args) as ReturnType<typeof loadDurableDomain<T>>,
  pruneOversizedClerkDurableDomains: (
    ...args: Parameters<typeof pruneOversizedClerkDurableDomains>
  ) => prune(...args),
}));

import {
  isVercelEphemeralFs,
  loadWorkJobByIdempotencyKeyFromDurable,
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

  it("distinguishes durable lookup failure from missing", async () => {
    loadDomain.mockResolvedValue({ jobs: [] });
    await expect(
      loadWorkJobByIdempotencyKeyFromDurable("user_1", "work:user_1:client:none"),
    ).resolves.toEqual({ status: "missing" });

    loadDomain.mockRejectedValue(new Error("connection timeout"));
    await expect(
      loadWorkJobByIdempotencyKeyFromDurable("user_1", "work:user_1:client:none"),
    ).resolves.toEqual({
      status: "unavailable",
      error: "connection timeout",
    });
  });
});
