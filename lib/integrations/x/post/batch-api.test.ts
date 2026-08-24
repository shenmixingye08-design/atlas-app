import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("@/lib/billing/access", () => ({
  requireBillingFeature: vi.fn(async () => null),
  requireAndConsumeAiJob: vi.fn(async () => null),
}));

vi.mock("@/lib/http/enforce-ai-rate-limit", () => ({
  enforceAiRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/http/rate-limit", () => ({
  consumeDistributedRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 7,
  })),
}));

vi.mock("@/lib/feature-flags/resolve-context", () => ({
  resolveFeatureAccessContext: vi.fn(async () => ({
    email: "owner@example.com",
    isOwner: false,
    isBetaUser: true,
  })),
}));

vi.mock("@/lib/integrations/x/post/autopost-memory", () => ({
  applyMemoryToDedicatedAutoPost: vi.fn(async (input: { settings: unknown }) => ({
    settings: input.settings,
    preference: {},
    applied: false,
    labels: [],
    memoryFailed: false,
    explicitOverride: false,
    guidance: [],
  })),
}));

vi.mock("@/lib/integrations/x/post/autopost-generator", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/x/post/autopost-generator")
  >("@/lib/integrations/x/post/autopost-generator");
  return {
    ...actual,
    generateAutoPostText: vi.fn(async (input: { slotKey: string }) => ({
      text: `生成文 ${input.slotKey}`,
      postType: "knowhow",
      usedFallback: true,
    })),
  };
});

import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { resetXPostBatchStoreForTests } from "./batch-store";
import { GET, POST } from "@/app/api/x/posts/batch/route";
import { GET as GET_ONE } from "@/app/api/x/posts/batch/[id]/route";
import { PATCH } from "@/app/api/x/posts/batch/[id]/items/[itemId]/route";

const OWNER = "user_batch_api_owner";
const OTHER = "user_batch_api_other";

function body(count: number) {
  return {
    purpose: "有益情報の発信",
    theme: "仕事の整理",
    audience: "個人事業主",
    tone: "丁寧",
    includeContent: "",
    forbiddenContent: "",
    hashtagPolicy: "付けない",
    count,
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    daysOfWeek: [1, 2, 3, 4, 5],
    postTime: "10:00",
    approvalMode: "approval",
    timezone: "Asia/Tokyo",
  };
}

beforeEach(() => {
  authMock.mockReset();
  resetXPostBatchStoreForTests();
  resetFeatureFlagStore();
  setFeatureFlagState("x", "on");
});

describe("X post batch API authz", () => {
  it("rejects unauthenticated create and list", async () => {
    authMock.mockResolvedValue({ userId: null });
    const list = await GET();
    expect(list.status).toBe(401);
    const created = await POST(
      new Request("http://localhost/api/x/posts/batch", {
        method: "POST",
        body: JSON.stringify(body(1)),
      }),
    );
    expect(created.status).toBe(401);
  });

  it("rejects over-limit counts before generation", async () => {
    authMock.mockResolvedValue({ userId: OWNER });
    const created = await POST(
      new Request("http://localhost/api/x/posts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(13)),
      }),
    );
    expect(created.status).toBe(422);
    const payload = (await created.json()) as { message?: string };
    expect(payload.message).toMatch(/最大/);
  });

  it("hides another user's batch", async () => {
    authMock.mockResolvedValue({ userId: OWNER });
    const created = await POST(
      new Request("http://localhost/api/x/posts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(1)),
      }),
    );
    expect(created.status).toBe(200);
    const payload = (await created.json()) as {
      batch: { id: string };
      items: Array<{ id: string }>;
    };

    authMock.mockResolvedValue({ userId: OTHER });
    const stolen = await GET_ONE(new Request("http://localhost"), {
      params: Promise.resolve({ id: payload.batch.id }),
    });
    expect(stolen.status).toBe(404);

    const edited = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ text: "他人の投稿" }),
      }),
      {
        params: Promise.resolve({
          id: payload.batch.id,
          itemId: payload.items[0]!.id,
        }),
      },
    );
    expect(edited.status).toBe(404);
  });
});
