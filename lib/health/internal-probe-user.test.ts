import { describe, expect, it } from "vitest";

import {
  createN05MemoryProbeUserIds,
  createN08ProbeOwnerIds,
  isInternalHealthProbeUserId,
  isInternalProbeIdentity,
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

  it("classifies N-05 memory health identities and rejects generic Clerk user_* ids", () => {
    const { probeUserA, probeUserB } = createN05MemoryProbeUserIds("test123");
    expect(probeUserA).toBe("user_n05_mem_a_test123");
    expect(probeUserB).toBe("user_n05_mem_b_test123");
    expect(isInternalProbeIdentity("user_n05_mem_test123")).toBe(true);
    expect(isInternalProbeIdentity(probeUserA)).toBe(true);
    expect(isInternalProbeIdentity(probeUserB)).toBe(true);
    expect(isInternalProbeIdentity("user_...")).toBe(false);
    expect(isInternalProbeIdentity("user_2abcRealClerkId")).toBe(false);
  });

  it("classifies sibling probe families from existing health routes", () => {
    expect(isInternalProbeIdentity("n07_user_a_abcd1234")).toBe(true);
    expect(isInternalProbeIdentity("n07_probe_abcd1234")).toBe(true);
    expect(isInternalProbeIdentity("user_p302_probe_a")).toBe(true);
    expect(isInternalProbeIdentity("user_p301_probe_b")).toBe(true);
    expect(isInternalHealthProbeUserId("__atlas_ocr_engine_probe__")).toBe(true);
    expect(isInternalHealthProbeUserId("__atlas_prod_schema_probe__")).toBe(true);
    expect(isInternalHealthProbeUserId("")).toBe(false);
    expect(isInternalHealthProbeUserId(null)).toBe(false);
  });
});
