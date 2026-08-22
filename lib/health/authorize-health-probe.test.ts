import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/automations/tick-auth", () => ({
  authorizeAutomationTick: vi.fn(),
}));

import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "./authorize-health-probe";

describe("authorizeHealthProbe", () => {
  beforeEach(() => {
    vi.mocked(authorizeAutomationTick).mockReset();
  });

  it("delegates to cron/owner tick auth", async () => {
    vi.mocked(authorizeAutomationTick).mockResolvedValue({
      ok: true,
      tickId: "tick_test",
      authMethod: "bearer_cron_secret",
      callerType: "unknown",
    });
    const req = new Request("https://atlasapp.jp/api/health/vision");
    await expect(authorizeHealthProbe(req)).resolves.toMatchObject({ ok: true });
  });

  it("returns 401 JSON without internal error detail for anonymous callers", async () => {
    vi.mocked(authorizeAutomationTick).mockResolvedValue({
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured",
      tickId: "tick_test",
      authMethod: "none",
      callerType: "external",
      rejectionReason: "cron_secret_unconfigured",
    });
    const gate = await authorizeHealthProbe(
      new Request("https://atlasapp.jp/api/health/vision"),
    );
    expect(gate).toEqual({ ok: false, status: 401, error: "Unauthorized" });
    if (gate.ok) return;
    const res = healthUnauthorizedResponse(gate);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      status: "unauthorized",
      error: "Unauthorized",
    });
    expect(JSON.stringify(body)).not.toMatch(/CRON|SECRET|schema|sql/i);
  });
});
