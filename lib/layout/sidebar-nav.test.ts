import { describe, expect, it } from "vitest";

import { resolveSidebarActiveId, isSidebarMoreActive } from "@/lib/layout/sidebar-nav";

describe("sidebar nav", () => {
  it("resolves primary routes", () => {
    expect(resolveSidebarActiveId("/projects")).toBe("projects");
    expect(resolveSidebarActiveId("/commander")).toBe("commander");
    expect(resolveSidebarActiveId("/history")).toBe("history");
    expect(resolveSidebarActiveId("/automations")).toBe("automations");
    expect(resolveSidebarActiveId("/settings")).toBe("settings");
  });

  it("resolves X autopost route", () => {
    expect(resolveSidebarActiveId("/workspace/x")).toBe("x-autopost");
  });

  it("detects more section active state", () => {
    expect(isSidebarMoreActive("x-autopost")).toBe(true);
    expect(isSidebarMoreActive("projects")).toBe(false);
  });
});
