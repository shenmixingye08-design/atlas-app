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
    expect(resolveBottomNavId("/notifications")).toBe("home");
    expect(resolveBottomNavId("/workspace")).toBe("work");
    expect(resolveBottomNavId("/history")).toBe("work");
    expect(resolveBottomNavId("/learned-jobs")).toBe("work");
    expect(resolveBottomNavId("/teach-work")).toBe("work");
    expect(resolveBottomNavId("/automations")).toBe("automation");
    expect(resolveBottomNavId("/deliverables")).toBe("deliverables");
    expect(resolveBottomNavId("/settings")).toBe("settings");
    expect(resolveBottomNavId("/settings/billing")).toBe("settings");
  });
});
