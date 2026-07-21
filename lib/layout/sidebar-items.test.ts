import { describe, expect, it } from "vitest";

import { SIDEBAR_PRIMARY_NAV } from "./sidebar-items";

describe("SIDEBAR_PRIMARY_NAV", () => {
  it("routes 新しい依頼 to request creation, not AI Orchestra", () => {
    const newRequest = SIDEBAR_PRIMARY_NAV.find((item) => item.id === "workspace");
    expect(newRequest?.href).toBe("/workspace");
    expect(SIDEBAR_PRIMARY_NAV.some((item) => item.href === "/commander")).toBe(
      false,
    );
  });
});
