import { describe, expect, it } from "vitest";

import {
  assertJobTransition,
  isJobTransitionAllowed,
} from "@/lib/jobs/transitions";

describe("job transitions", () => {
  it("blocks illegal transitions", () => {
    expect(isJobTransitionAllowed("failed", "completed")).toBe(false);
    expect(isJobTransitionAllowed("cancelled", "running")).toBe(false);
    expect(isJobTransitionAllowed("completed", "retrying")).toBe(false);
    expect(() => assertJobTransition("failed", "completed")).toThrow(
      /invalid_state_transition/
    );
  });

  it("allows legal transitions", () => {
    expect(isJobTransitionAllowed("queued", "running")).toBe(true);
    expect(isJobTransitionAllowed("running", "retrying")).toBe(true);
    expect(isJobTransitionAllowed("retrying", "running")).toBe(true);
  });
});
