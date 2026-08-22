/**
 * Permanent CI guard: Work Memory confirm/reject must survive
 * serverless isolate splits. If hydration is skipped again, CI fails.
 *
 * CASE A: GET isolate ≠ POST isolate
 * CASE B: empty in-memory store still confirms after durable hydrate
 * CASE C: reject under the same isolate split
 * CASE D: other user's candidateId is refused
 * CASE E: unknown candidateId is 404
 * CASE F: double confirm does not duplicate Memory
 * CASE G: confirmed candidate leaves the list; one Memory appears
 * CASE H: confirmed Memory survives re-hydrate from durable
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMock = vi.hoisted(() => vi.fn(async () => ({ userId: "user_wm_confirm_a" })));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

const durableByUser = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/persistence/durable-domain", () => ({
  loadDurableDomain: vi.fn(async (userId: string, key: string) => {
    if (key !== "atlasWorkMemory") return null;
    return durableByUser.get(userId) ?? null;
  }),
  persistDurableDomain: vi.fn(
    async (userId: string, key: string, payload: unknown) => {
      if (key === "atlasWorkMemory") durableByUser.set(userId, payload);
      return "supabase";
    },
  ),
}));

import { persistWorkMemoryNow } from "./durable";
import {
  confirmWorkMemoryCandidate,
  createWorkMemoryCandidate,
  listWorkMemories,
  rejectWorkMemoryCandidate,
} from "./service";
import {
  evictWorkMemoryRuntimeForUser,
  resetWorkMemoryRuntimeForTests,
} from "./store";

const USER_A = "user_wm_confirm_a";
const USER_B = "user_wm_confirm_b";

function seedCandidate(userId: string, title = "営業資料の型") {
  return createWorkMemoryCandidate(userId, {
    trigger: "explicit_save",
    type: "template",
    title,
    summary: "16:9 · 青ベース",
    structuredData: { format: "widescreen" },
    sourceType: "user_explicit",
    confidence: 0.82,
    reason: "テスト候補",
  });
}

describe("work memory candidate confirm isolation (permanent)", () => {
  beforeEach(() => {
    durableByUser.clear();
    resetWorkMemoryRuntimeForTests();
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: USER_A });
  });

  afterEach(() => {
    durableByUser.clear();
    resetWorkMemoryRuntimeForTests();
  });

  it("CASE A: confirm succeeds after a new serverless isolate", async () => {
    const candidate = seedCandidate(USER_A);
    expect(candidate).not.toBeNull();
    await persistWorkMemoryNow(USER_A);
    evictWorkMemoryRuntimeForUser(USER_A);

    expect(listWorkMemories(USER_A).candidates).toHaveLength(0);
    const memory = await confirmWorkMemoryCandidate(
      USER_A,
      candidate!.candidateId,
    );
    expect(memory?.isUserConfirmed).toBe(true);
    expect(memory?.title).toBe("営業資料の型");

    evictWorkMemoryRuntimeForUser(USER_A);
    const { POST } = await import(
      "@/app/api/work-memory/candidates/[id]/confirm/route"
    );
    const other = seedCandidate(USER_A, "ルート確認");
    await persistWorkMemoryNow(USER_A);
    evictWorkMemoryRuntimeForUser(USER_A);
    const response = await POST(
      new Request(
        `https://atlasapp.jp/api/work-memory/candidates/${other!.candidateId}/confirm`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: other!.candidateId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { memory?: { title?: string } };
    expect(body.memory?.title).toBe("ルート確認");
  });

  it("CASE B: empty in-memory store hydrates then confirms", async () => {
    const candidate = seedCandidate(USER_A, "空ストア確認");
    await persistWorkMemoryNow(USER_A);
    evictWorkMemoryRuntimeForUser(USER_A);

    const memory = await confirmWorkMemoryCandidate(
      USER_A,
      candidate!.candidateId,
    );
    expect(memory).not.toBeNull();
    expect(listWorkMemories(USER_A).candidates).toHaveLength(0);
  });

  it("CASE C: reject succeeds after isolate split", async () => {
    const candidate = seedCandidate(USER_A, "拒否候補");
    await persistWorkMemoryNow(USER_A);
    evictWorkMemoryRuntimeForUser(USER_A);

    const rejected = await rejectWorkMemoryCandidate(
      USER_A,
      candidate!.candidateId,
    );
    expect(rejected).toBe(true);
    expect(listWorkMemories(USER_A).candidates).toHaveLength(0);
    expect(listWorkMemories(USER_A).memories).toHaveLength(0);
  });

  it("CASE D: other user's candidateId is refused", async () => {
    const candidate = seedCandidate(USER_A, "Aの候補");
    await persistWorkMemoryNow(USER_A);
    evictWorkMemoryRuntimeForUser(USER_A);
    evictWorkMemoryRuntimeForUser(USER_B);

    const stolen = await confirmWorkMemoryCandidate(
      USER_B,
      candidate!.candidateId,
    );
    expect(stolen).toBeNull();
    const stillA = await confirmWorkMemoryCandidate(
      USER_A,
      candidate!.candidateId,
    );
    expect(stillA?.userId).toBe(USER_A);
  });

  it("CASE E: unknown candidateId is not found", async () => {
    const missing = await confirmWorkMemoryCandidate(
      USER_A,
      "wmc_00000000-0000-0000-0000-000000000000",
    );
    expect(missing).toBeNull();
  });

  it("CASE E route: unknown candidate returns 404 with diagnosticId", async () => {
    authMock.mockResolvedValue({ userId: USER_A });
    const { POST } = await import(
      "@/app/api/work-memory/candidates/[id]/confirm/route"
    );
    const response = await POST(
      new Request("https://atlasapp.jp/api/work-memory/candidates/wmc_missing/confirm", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "wmc_missing" }) },
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error?: string;
      diagnosticId?: string;
    };
    expect(body.error).toMatch(/見つかりませんでした/);
    expect(body.diagnosticId).toMatch(/p5_wmcconfirm_/);
    expect(response.status).not.toBe(200);
  });

  it("CASE F: double confirm does not create two memories", async () => {
    const candidate = seedCandidate(USER_A, "二重確認");
    await persistWorkMemoryNow(USER_A);

    const first = await confirmWorkMemoryCandidate(
      USER_A,
      candidate!.candidateId,
    );
    const second = await confirmWorkMemoryCandidate(
      USER_A,
      candidate!.candidateId,
    );
    expect(first?.id).toBeTruthy();
    expect(second?.id).toBe(first?.id);
    expect(
      listWorkMemories(USER_A).memories.filter((row) => row.title === "二重確認"),
    ).toHaveLength(1);
  });

  it("CASE G: confirmed candidate leaves the list and one memory appears", async () => {
    resetWorkMemoryRuntimeForTests();
    const candidate = seedCandidate(USER_A, "一覧反映");
    await persistWorkMemoryNow(USER_A);
    const before = listWorkMemories(USER_A);
    expect(before.candidates.some((row) => row.candidateId === candidate!.candidateId)).toBe(
      true,
    );

    await confirmWorkMemoryCandidate(USER_A, candidate!.candidateId);
    const after = listWorkMemories(USER_A);
    expect(
      after.candidates.some((row) => row.candidateId === candidate!.candidateId),
    ).toBe(false);
    expect(after.memories.filter((row) => row.title === "一覧反映")).toHaveLength(
      1,
    );
  });

  it("CASE H: confirmed memory survives durable re-hydrate", async () => {
    const candidate = seedCandidate(USER_A, "再読込後も残る");
    await persistWorkMemoryNow(USER_A);
    evictWorkMemoryRuntimeForUser(USER_A);

    const memory = await confirmWorkMemoryCandidate(
      USER_A,
      candidate!.candidateId,
    );
    expect(memory).not.toBeNull();
    await persistWorkMemoryNow(USER_A);
    evictWorkMemoryRuntimeForUser(USER_A);

    const { ensureWorkMemoryHydrated } = await import("./durable");
    await ensureWorkMemoryHydrated(USER_A);
    const reloaded = listWorkMemories(USER_A);
    expect(
      reloaded.memories.filter((row) => row.title === "再読込後も残る"),
    ).toHaveLength(1);
    expect(reloaded.candidates).toHaveLength(0);
  });
});
