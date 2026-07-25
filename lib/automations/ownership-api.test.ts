import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
}));

describe("automation run ownership API", () => {
  beforeEach(async () => {
    authMock.mockReset();
    const { resetAutomationStore } = await import(
      "./repositories/server-automation-repository"
    );
    const { resetAutomationsGlobalDurableForTests } = await import(
      "./global-durable"
    );
    resetAutomationStore({ seed: false });
    resetAutomationsGlobalDurableForTests();
  });

  it("denies listing another user's automation runs", async () => {
    const { automationService } = await import("./automation-service");
    const { GET } = await import("@/app/api/automations/[id]/run/route");

    const owned = await automationService.createForUser("user_a", {
      name: "Aの自動化",
      description: "desc",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 9:00",
      },
      workflow: { assignment: "要約" },
      enabled: true,
    });

    authMock.mockResolvedValue({ userId: "user_b" });
    const response = await GET(
      new Request(`http://localhost/api/automations/${owned.id}/run`),
      { params: Promise.resolve({ id: owned.id }) },
    );

    expect(response.status).toBe(404);
  });

  it("allows owner to list their automation runs", async () => {
    const { automationService } = await import("./automation-service");
    const { GET } = await import("@/app/api/automations/[id]/run/route");

    const owned = await automationService.createForUser("user_a", {
      name: "Aの自動化",
      description: "desc",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 9:00",
      },
      workflow: { assignment: "要約" },
      enabled: true,
    });

    authMock.mockResolvedValue({ userId: "user_a" });
    const response = await GET(
      new Request(`http://localhost/api/automations/${owned.id}/run`),
      { params: Promise.resolve({ id: owned.id }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { runs: unknown[] };
    expect(Array.isArray(body.runs)).toBe(true);
  });
});
