import { describe, expect, it } from "vitest";

import { resolveBottomNavId, shouldHideBottomNav } from "./bottom-nav";

describe("bottom nav", () => {
  it("hides on auth and owner routes", () => {
    expect(shouldHideBottomNav("/")).toBe(true);
    expect(shouldHideBottomNav("/sign-in")).toBe(true);
    expect(shouldHideBottomNav("/owner/simulator")).toBe(true);
    expect(shouldHideBottomNav("/projects")).toBe(false);
  });

  it("resolves active tab from pathname", () => {
    expect(resolveBottomNavId("/projects")).toBe("home");
    // AI Orchestra remains reachable, but primary「送る」lands on /workspace.
    expect(resolveBottomNavId("/commander")).toBe("request");
    expect(resolveBottomNavId("/workspace")).toBe("request");
    expect(resolveBottomNavId("/chat")).toBe("request");
    expect(resolveBottomNavId("/learned-jobs")).toBe("request");
    expect(resolveBottomNavId("/teach-work")).toBe("request");
    expect(resolveBottomNavId("/history")).toBe("history");
    expect(resolveBottomNavId("/automations")).toBe("automation");
    expect(resolveBottomNavId("/settings")).toBe("settings");
    expect(resolveBottomNavId("/settings/work-memory")).toBe("settings");
    expect(resolveBottomNavId("/settings/learning")).toBe("settings");
    expect(resolveBottomNavId("/settings/billing")).toBe("settings");
  });
});
