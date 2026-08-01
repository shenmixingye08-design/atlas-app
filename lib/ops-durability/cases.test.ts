import { describe, expect, it } from "vitest";

import {
  assertOpsJobCaseCounts,
  OPS_JOB_CASES,
} from "@/lib/ops-durability/cases";

describe("ops durability cases", () => {
  it("has 500 unique job cases", () => {
    expect(OPS_JOB_CASES.length).toBe(500);
    assertOpsJobCaseCounts();
    expect(new Set(OPS_JOB_CASES.map((c) => c.uniqueToken)).size).toBe(500);
  });
});
