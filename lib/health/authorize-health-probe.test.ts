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
    vi.mocked(authorizeAutomationTick).mockResolvedValue({ ok: true });
    const req = new Request("https://atlasapp.jp/api/health/vision");
    await expect(authorizeHealthProbe(req)).resolves.toEqual({ ok: true });
  });

  it("returns unauthorized JSON for anonymous callers", () => {
    const res = healthUnauthorizedResponse({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    expect(res.status).toBe(401);
  });
});
