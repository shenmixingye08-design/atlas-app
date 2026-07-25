import { describe, expect, it } from "vitest";

import { isDefaultPushEventEnabled, isSpamCategory } from "@/lib/push/categories";

describe("push categories", () => {
  it("defaults final success ON", () => {
    expect(isDefaultPushEventEnabled("final_success")).toBe(true);
  });

  it("defaults mid_retry OFF", () => {
    expect(isDefaultPushEventEnabled("mid_retry")).toBe(false);
  });

  it("marks mid_retry as spam", () => {
    expect(isSpamCategory("mid_retry")).toBe(true);
  });
});
