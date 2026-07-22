import { describe, expect, it } from "vitest";

import { resolveSidebarActiveId, isSidebarMoreActive } from "@/lib/layout/sidebar-nav";

describe("sidebar nav", () => {
  it("resolves primary routes", () => {
    expect(resolveSidebarActiveId("/projects")).toBe("projects");
    expect(resolveSidebarActiveId("/workspace")).toBe("history");
    expect(resolveSidebarActiveId("/history")).toBe("history");
    expect(resolveSidebarActiveId("/automations")).toBe("automations");
    expect(resolveSidebarActiveId("/deliverables")).toBe("deliverables");
    expect(resolveSidebarActiveId("/settings")).toBe("settings");
  });

  it("resolves X autopost route without colliding with request creation", () => {
    expect(resolveSidebarActiveId("/workspace/x")).toBe("x-autopost");
    expect(resolveSidebarActiveId("/workspace")).toBe("history");
  });

  it("detects more section active state", () => {
    expect(isSidebarMoreActive("x-autopost")).toBe(true);
    expect(isSidebarMoreActive("projects")).toBe(false);
  });
});
