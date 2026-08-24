/**
 * Permanent CI guard: Personal Memory confirm/reject must survive
 * serverless isolate splits. Candidates live in atlasPersonalMemory DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMock = vi.hoisted(() =>
  vi.fn(async () => ({ userId: "user_pm_confirm_a" })),
);

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

const durableByUser = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/persistence/durable-domain", () => ({
  loadDurableDomain: vi.fn(async (userId: string, key: string) => {
    if (key !== "atlasPersonalMemory") return null;
    return durableByUser.get(userId) ?? null;
  }),
  persistDurableDomain: vi.fn(
    async (userId: string, key: string, payload: unknown) => {
      if (key === "atlasPersonalMemory") durableByUser.set(userId, payload);
      return "supabase";
    },
  ),
}));

vi.mock("@/lib/http/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
}));

import {
  evictPersonalMemoryCacheForUser,
  persistPersonalMemoryNow,
  resetPersonalMemoryDurableForTests,
} from "./durable";
import {
  approveCandidate,
  createPersonalMemory,
  listPersonalMemories,
  rejectCandidate,
} from "./service";
import { resetPersonalMemoryStoreForTests } from "./store";

const USER_A = "user_pm_confirm_a";
const USER_B = "user_pm_confirm_b";

async function seedCandidate(userId: string, title = "文体の候補") {
  return createPersonalMemory(userId, {
    kind: "user_preference",
    scope: "writing_style",
    key: "writing_preference",
    value: { text: "短め", length: "short" },
    title,
    summary: "短め",
    source: "user_correction",
    status: "candidate",
    candidateReason: "isolation_test",
  });
}

describe("personal memory candidate confirm isolation (permanent)", () => {
  beforeEach(() => {
    durableByUser.clear();
    resetPersonalMemoryStoreForTests();
    resetPersonalMemoryDurableForTests();
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: USER_A });
  });

  afterEach(() => {
    durableByUser.clear();
    resetPersonalMemoryStoreForTests();
    resetPersonalMemoryDurableForTests();
  });

  it("CASE A: confirm succeeds after a new serverless isolate", async () => {
    const candidate = await seedCandidate(USER_A);
    await persistPersonalMemoryNow(USER_A);
    evictPersonalMemoryCacheForUser(USER_A);

    const { listStoredPersonalMemories } = await import("./store");
    expect(listStoredPersonalMemories(USER_A)).toHaveLength(0);
    const memory = await approveCandidate(USER_A, candidate.id);
    expect(memory.status).toBe("active");
    expect(memory.title).toBe("文体の候補");
  });

  it("CASE B: empty in-memory store hydrates then confirms", async () => {
    const candidate = await seedCandidate(USER_A, "空ストア確認");
    await persistPersonalMemoryNow(USER_A);
    evictPersonalMemoryCacheForUser(USER_A);

    const memory = await approveCandidate(USER_A, candidate.id);
    expect(memory.status).toBe("active");
  });

  it("CASE C: reject succeeds after isolate split", async () => {
    const candidate = await seedCandidate(USER_A, "拒否候補");
    await persistPersonalMemoryNow(USER_A);
    evictPersonalMemoryCacheForUser(USER_A);

    const rejected = await rejectCandidate(USER_A, candidate.id);
    expect(rejected.status).toBe("rejected");
    const active = await listPersonalMemories(USER_A, { status: "active" });
    expect(active).toHaveLength(0);
  });

  it("CASE D: other user's candidateId is refused", async () => {
    const candidate = await seedCandidate(USER_A, "Aの候補");
    await persistPersonalMemoryNow(USER_A);
    evictPersonalMemoryCacheForUser(USER_A);
    evictPersonalMemoryCacheForUser(USER_B);

    await expect(approveCandidate(USER_B, candidate.id)).rejects.toThrow(
      /見つかりませんでした/,
    );
    const stillA = await approveCandidate(USER_A, candidate.id);
    expect(stillA.userId).toBe(USER_A);
  });

  it("CASE E route: unknown candidate returns 404 with diagnosticId", async () => {
    const { POST } = await import("@/app/api/personal-memory/[id]/approve/route");
    const response = await POST(
      new Request("https://atlasapp.jp/api/personal-memory/missing/approve", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error?: string;
      diagnosticId?: string;
    };
    expect(body.error).toMatch(/見つかりませんでした/);
    expect(body.diagnosticId).toBeTruthy();
  });

  it("CASE F: double confirm does not create two memories", async () => {
    const candidate = await seedCandidate(USER_A, "二重確認");
    const first = await approveCandidate(USER_A, candidate.id);
    const second = await approveCandidate(USER_A, candidate.id);
    expect(first.id).toBe(second.id);
    const active = (await listPersonalMemories(USER_A, { status: "active" })).filter(
      (row) => row.title === "二重確認",
    );
    expect(active).toHaveLength(1);
  });

  it("CASE G: reject is idempotent", async () => {
    const candidate = await seedCandidate(USER_A, "二重拒否");
    const first = await rejectCandidate(USER_A, candidate.id);
    const second = await rejectCandidate(USER_A, candidate.id);
    expect(first.id).toBe(second.id);
    expect(second.status).toBe("rejected");
  });

  it("CASE H: confirmed memory survives durable re-hydrate", async () => {
    const candidate = await seedCandidate(USER_A, "再読込後も残る");
    evictPersonalMemoryCacheForUser(USER_A);
    const memory = await approveCandidate(USER_A, candidate.id);
    expect(memory.status).toBe("active");
    evictPersonalMemoryCacheForUser(USER_A);
    const reloaded = await listPersonalMemories(USER_A, { status: "active" });
    expect(reloaded.some((row) => row.title === "再読込後も残る")).toBe(true);
  });

  it("CASE I: expired candidate is not confirmed", async () => {
    const candidate = await createPersonalMemory(USER_A, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "期限切れ" },
      title: "期限切れ",
      summary: "期限切れ",
      source: "user_correction",
      status: "candidate",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await expect(approveCandidate(USER_A, candidate.id)).rejects.toThrow(/有効期限/);
  });

  it("CASE J: confirm alias route hydrates then succeeds", async () => {
    const candidate = await seedCandidate(USER_A, "確認ルート");
    evictPersonalMemoryCacheForUser(USER_A);
    const { POST } = await import("@/app/api/personal-memory/[id]/confirm/route");
    const response = await POST(
      new Request(`https://atlasapp.jp/api/personal-memory/${candidate.id}/confirm`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: candidate.id }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { memory?: { title?: string } };
    expect(body.memory?.title).toBe("確認ルート");
  });
});
