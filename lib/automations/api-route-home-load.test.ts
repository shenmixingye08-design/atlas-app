import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("@/lib/automations/automation-service", () => ({
  automationService: {
    listForUser: vi.fn(),
  },
}));

import { automationService } from "@/lib/automations/automation-service";
import {
  AutomationSchemaMissingError,
  AutomationStoreUnavailableError,
} from "@/lib/automations/durable-automation-definitions";
import { GET } from "@/app/api/automations/route";

describe("GET /api/automations home-load contract", () => {
  beforeEach(() => {
    authMock.mockReset();
    vi.mocked(automationService.listForUser).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 with unauthorized code when session missing", async () => {
    authMock.mockResolvedValue({ userId: null });
    const response = await GET();
    expect(response.status).toBe(401);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("unauthorized");
  });

  it("returns 200 [] for empty automations (valid empty home)", async () => {
    authMock.mockResolvedValue({ userId: "user_empty" });
    vi.mocked(automationService.listForUser).mockResolvedValue([]);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns 503 with requestId on store unavailable (not unhandled 500)", async () => {
    authMock.mockResolvedValue({ userId: "user_fail" });
    vi.mocked(automationService.listForUser).mockRejectedValue(
      new AutomationStoreUnavailableError(
        "[automations] P0-6: durable list failed — memory fallback disabled (timeout)",
        "auto_list_test_diag",
      ),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      code?: string;
      requestId?: string;
      error?: string;
    };
    expect(body.code).toBe("automation_store_unavailable");
    expect(body.requestId).toBe("auto_list_test_diag");
    expect(body.error).toBeTruthy();
    expect(String(body.error)).not.toMatch(/memory fallback|supabase|P0-6/i);
  });

  it("returns 503 with schema_missing code when schema error escapes hydrate", async () => {
    authMock.mockResolvedValue({ userId: "user_schema" });
    vi.mocked(automationService.listForUser).mockRejectedValue(
      new AutomationSchemaMissingError(
        "[automations] P0-6: durable list failed — schema missing",
        "auto_schema_test_diag",
      ),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code?: string; requestId?: string };
    expect(body.code).toBe("automation_schema_missing");
    expect(body.requestId).toBe("auto_schema_test_diag");
  });
});
