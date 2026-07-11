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
    expect(resolveBottomNavId("/workspace")).toBe("request");
    expect(resolveBottomNavId("/chat")).toBe("request");
    expect(resolveBottomNavId("/history")).toBe("history");
    expect(resolveBottomNavId("/learned-jobs")).toBe("memory");
    expect(resolveBottomNavId("/teach-work")).toBe("memory");
    expect(resolveBottomNavId("/settings/work-memory")).toBe("memory");
    expect(resolveBottomNavId("/settings/learning")).toBe("analysis");
    expect(resolveBottomNavId("/settings/billing")).toBe(null);
    expect(resolveBottomNavId("/automations")).toBe(null);
  });
});
