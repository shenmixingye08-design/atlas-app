import { describe, expect, it } from "vitest";

import {
  createN08ProbeOwnerIds,
  isInternalHealthProbeUserId,
} from "./internal-probe-user";

describe("internal health probe user classification", () => {
  it("classifies generated n08 probe owners without treating Clerk users as probes", () => {
    const { ownerA, ownerB } = createN08ProbeOwnerIds();
    expect(ownerA.startsWith("n08_probe_a_")).toBe(true);
    expect(ownerB.startsWith("n08_probe_b_")).toBe(true);
    expect(isInternalHealthProbeUserId(ownerA)).toBe(true);
    expect(isInternalHealthProbeUserId(ownerB)).toBe(true);
    expect(isInternalHealthProbeUserId("user_2abcRealClerkId")).toBe(false);
    expect(isInternalHealthProbeUserId("user_real_customer")).toBe(false);
  });

  it("classifies sentinel health-probe ids used by existing probes", () => {
    expect(isInternalHealthProbeUserId("__atlas_ocr_engine_probe__")).toBe(true);
    expect(isInternalHealthProbeUserId("__atlas_prod_schema_probe__")).toBe(true);
    expect(isInternalHealthProbeUserId("n07_probe_abcd1234")).toBe(true);
    expect(isInternalHealthProbeUserId("")).toBe(false);
    expect(isInternalHealthProbeUserId(null)).toBe(false);
  });
});
