import { describe, expect, it } from "vitest";

import { SIDEBAR_PRIMARY_NAV } from "./sidebar-items";

describe("SIDEBAR_PRIMARY_NAV", () => {
  it("uses unified nav without AI Orchestra or duplicate request labels", () => {
    expect(SIDEBAR_PRIMARY_NAV.some((item) => item.href === "/commander")).toBe(
      false,
    );
    // Merged nav: main's /workspace (新しい依頼) + phase deliverables entry.
    expect(SIDEBAR_PRIMARY_NAV.map((item) => item.href)).toEqual([
      "/projects",
      "/workspace",
      "/history",
      "/automations",
      "/deliverables",
      "/settings",
    ]);
  });
});
