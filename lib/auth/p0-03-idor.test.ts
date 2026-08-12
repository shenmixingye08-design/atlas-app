import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  // P3-02: atlasActiveCompany is supabase-only — tests must not fake Clerk SoT.
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
}));

vi.mock("@/lib/automations/durable", () => ({
  persistAutomationsNow: vi.fn(async () => undefined),
  ensureAutomationsHydrated: vi.fn(async () => undefined),
}));

vi.mock("@/lib/automations/global-durable", () => ({
  registerAutomationUserId: vi.fn(async () => undefined),
  unregisterAutomationUserIdIfEmpty: vi.fn(async () => undefined),
}));

describe("P0-03 IDOR / authz boundary", () => {
  beforeEach(async () => {
    authMock.mockReset();
    const { resetKnowledgeStoreForTests } = await import(
      "@/lib/knowledge/repositories/server-knowledge-repository"
    );
    const { resetIntegrationStoreForTests } = await import(
      "@/lib/integrations/repositories/server-integration-repository"
    );
    const { resetAutomationStore } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    resetKnowledgeStoreForTests();
    resetIntegrationStoreForTests();
    resetAutomationStore({ seed: false });
  });

  it("denies unauthenticated knowledge list", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { GET } = await import("@/app/api/knowledge/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("User B cannot list User A knowledge entries", async () => {
    const { knowledgeService } = await import("@/lib/knowledge/knowledge-service");
    await knowledgeService.ingestFromWorkflow(
      {
        status: "completed",
        approved: true,
        assignment: "秘密の案件",
        finalResponse: "User A だけの成果物本文",
        tasks: [],
        executions: [],
        warnings: [],
      } as never,
      {
        userId: "user_a",
        workflowId: "wf_a",
        assignment: "秘密の案件",
      },
    );

    authMock.mockResolvedValue({ userId: "user_b" });
    const { GET } = await import("@/app/api/knowledge/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entries: Array<{ userId?: string; content?: string; summary?: string }>;
    };
    expect(body.entries).toHaveLength(0);
    expect(JSON.stringify(body)).not.toContain("User A だけの成果物本文");
  });

  it("User B cannot GET/DELETE User A integration by id", async () => {
    const { serverIntegrationRepository } = await import(
      "@/lib/integrations/repositories/server-integration-repository"
    );
    const { integrationService } = await import(
      "@/lib/integrations/integration-service"
    );
    // Persist a Drive row directly — placeholder Slack connect is forbidden.
    const now = new Date().toISOString();
    const owned = await serverIntegrationRepository.save({
      id: "int_idor_a_drive",
      userId: "user_a",
      provider: "google_drive",
      name: "A drive",
      status: "connected",
      connected: true,
      authType: "oauth2",
      scopes: [],
      lastSyncAt: now,
      createdAt: now,
      updatedAt: now,
    });

    authMock.mockResolvedValue({ userId: "user_b" });
    const { GET, DELETE } = await import("@/app/api/integrations/[id]/route");

    const getRes = await GET(new Request("http://localhost/api/integrations/x"), {
      params: Promise.resolve({ id: owned.id }),
    });
    expect([401, 403, 404]).toContain(getRes.status);
    const getBody = await getRes.text();
    expect(getBody).not.toContain("A drive");
    expect(getBody).not.toMatch(/user_a/);

    const delRes = await DELETE(
      new Request("http://localhost/api/integrations/x"),
      { params: Promise.resolve({ id: owned.id }) },
    );
    expect([401, 403, 404]).toContain(delRes.status);

    // Still owned by A
    const still = await integrationService.getByIdForUser(owned.id, "user_a");
    expect(still).not.toBeNull();
  });

  it("rejects body userId override on integration connect", async () => {
    authMock.mockResolvedValue({ userId: "user_a" });
    const { POST } = await import("@/app/api/integrations/route");
    const response = await POST(
      new Request("http://localhost/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google_drive",
          userId: "user_b",
        }),
      }),
    );
    // Body userId override is ignored; Drive still requires OAuth (not placeholder).
    expect([400, 403, 422]).toContain(response.status);
  });

  it("deliverable lookup denies cross-user read (Drive save ownership path)", async () => {
    const {
      saveDeliverableFile,
      getStoredDeliverable,
      getStoredDeliverableForUser,
    } = await import("@/lib/deliverables/store");
    const stored = saveDeliverableFile(
      {
        format: "docx",
        fileName: "secret.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from("secret-bytes"),
        isPlaceholder: false,
      },
      "user_a",
      { sourceContent: "# secret", baseFileName: "secret" },
    );

    expect(getStoredDeliverable(stored.id)?.userId).toBe("user_a");
    // Cross-user must never see the binary / metadata path.
    expect(await getStoredDeliverableForUser(stored.id, "user_b")).toBeNull();

    // Source must call ForUser (regression: unscoped getStoredDeliverable).
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("lib/integrations/google/drive/service.ts", "utf8"),
    );
    expect(source).toMatch(/getStoredDeliverableForUser\(/);
    expect(source).not.toMatch(/getStoredDeliverable\(input\.deliverableId\)/);
  });

  it("marketplace install scopes automations to the caller only", async () => {
    authMock.mockResolvedValue({ userId: "user_a" });
    const { POST: install } = await import(
      "@/app/api/marketplace/[templateId]/install/route"
    );
    const { companyTemplates } = await import(
      "@/lib/company-templates/registry"
    );
    const templateId = companyTemplates[0]!.id;

    const res = await install(new Request("http://localhost"), {
      params: Promise.resolve({ templateId }),
    });
    expect([200, 201]).toContain(res.status);

    const { automationService } = await import(
      "@/lib/automations/automation-service"
    );
    const aList = await automationService.listForUser("user_a");
    const bList = await automationService.listForUser("user_b");
    expect(aList.length).toBeGreaterThan(0);
    expect(bList).toHaveLength(0);
    expect(aList.every((row) => row.userId === "user_a")).toBe(true);
  });

  it("cron tick fails closed without secret in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
    authMock.mockResolvedValue({ userId: "user_a" });
    const { authorizeAutomationTick } = await import(
      "@/lib/automations/tick-auth"
    );
    const gate = await authorizeAutomationTick(
      new Request("http://localhost/api/automations/tick", { method: "POST" }),
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect([401, 503]).toContain(gate.status);
    }
    vi.unstubAllEnvs();
  });
});
