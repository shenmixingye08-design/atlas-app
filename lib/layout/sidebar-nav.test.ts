import { describe, expect, it } from "vitest";

import { resolveSidebarActiveId, isSidebarMoreActive } from "@/lib/layout/sidebar-nav";

describe("sidebar nav", () => {
  it("resolves primary routes", () => {
    expect(resolveSidebarActiveId("/projects")).toBe("projects");
    expect(resolveSidebarActiveId("/workspace")).toBe("workspace");
    expect(resolveSidebarActiveId("/commander")).toBe("commander");
    expect(resolveSidebarActiveId("/history")).toBe("history");
    expect(resolveSidebarActiveId("/automations")).toBe("automations");
    expect(resolveSidebarActiveId("/settings")).toBe("settings");
  });

  it("resolves business profile under settings without colliding with settings hub", () => {
    expect(resolveSidebarActiveId("/settings/business-profile")).toBe(
      "business-profile",
    );
    expect(resolveSidebarActiveId("/settings")).toBe("settings");
    expect(isSidebarMoreActive("business-profile")).toBe(true);
  });

  it("resolves X autopost route without colliding with request creation", () => {
    expect(resolveSidebarActiveId("/workspace/x")).toBe("x-autopost");
    expect(resolveSidebarActiveId("/workspace")).toBe("workspace");
  });

  it("detects more section active state", () => {
    expect(isSidebarMoreActive("x-autopost")).toBe(true);
    expect(isSidebarMoreActive("projects")).toBe(false);
  });
});
