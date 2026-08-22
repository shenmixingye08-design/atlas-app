import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ATLAS_PUBLIC_API_MATCHERS } from "./public-routes";
import {
  isClerkMiddlewareCronBypassPath,
} from "./clerk-cron-bypass";

describe("clerk cron matcher bypass", () => {
  it("excludes tick and drain, not the rest of automations API", () => {
    expect(isClerkMiddlewareCronBypassPath("/api/automations/tick")).toBe(true);
    expect(isClerkMiddlewareCronBypassPath("/api/automations/tick/")).toBe(true);
    expect(isClerkMiddlewareCronBypassPath("/api/worker/drain")).toBe(true);
    expect(isClerkMiddlewareCronBypassPath("/api/automations")).toBe(false);
    expect(isClerkMiddlewareCronBypassPath("/api/billing/summary")).toBe(false);
    expect(isClerkMiddlewareCronBypassPath("/projects")).toBe(false);
  });

  it("keeps route-level auth: tick stays middleware-public, not world-public", () => {
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain("/api/automations/tick(.*)");
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toContain("isClerkMiddlewareCronBypassPath");
    expect(proxy).toContain("api/automations/tick");
    expect(proxy).toContain("api/worker/drain");
    const tickAuth = readFileSync(
      join(process.cwd(), "lib/automations/tick-auth.ts"),
      "utf8",
    );
    expect(tickAuth).toContain("timingSafeEqual");
    expect(tickAuth).toContain("CRON_SECRET");
  });
});
