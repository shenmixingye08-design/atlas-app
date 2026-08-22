import { describe, expect, it, vi } from "vitest";

import {
  classifyInternalProbeIdentity,
  createN08ProbeOwnerIds,
  isInternalHealthProbeUserId,
  isInternalProbeUser,
  skipClerkRemoteForInternalProbe,
} from "./internal-probe-user";

describe("internal health probe user classification", () => {
  it("classifies generated n08 probe owners without treating Clerk users as probes", () => {
    const { ownerA, ownerB } = createN08ProbeOwnerIds();
    expect(ownerA.startsWith("n08_probe_a_")).toBe(true);
    expect(ownerB.startsWith("n08_probe_b_")).toBe(true);
    expect(isInternalHealthProbeUserId(ownerA)).toBe(true);
    expect(isInternalHealthProbeUserId(ownerB)).toBe(true);
    expect(isInternalProbeUser("user_2abcRealClerkId")).toBe(false);
    expect(isInternalProbeUser("user_real_customer")).toBe(false);
  });

  it("classifies sentinel health-probe ids used by existing probes", () => {
    expect(isInternalProbeUser("__atlas_ocr_engine_probe__")).toBe(true);
    expect(isInternalProbeUser("__atlas_prod_schema_probe__")).toBe(true);
    expect(isInternalProbeUser("n07_probe_abcd1234")).toBe(true);
    expect(isInternalProbeUser("")).toBe(false);
    expect(isInternalProbeUser(null)).toBe(false);
  });

  it("classifies n07 / n05 / p302 probe identities by meaning", () => {
    expect(isInternalProbeUser("n07_user_a_12ab34cd")).toBe(true);
    expect(isInternalProbeUser("n07_user_b_ff00aa11")).toBe(true);
    expect(isInternalProbeUser("user_n05_mem_a_run1")).toBe(true);
    expect(isInternalProbeUser("user_n05_mem_b_run1")).toBe(true);
    expect(isInternalProbeUser("user_p302_probe_a")).toBe(true);
    expect(isInternalProbeUser("user_p302_probe_b")).toBe(true);
    expect(classifyInternalProbeIdentity("n07_user_a_12ab34cd")).toMatchObject({
      isProbe: true,
      probeType: "n07_soft_success_probe",
    });
    expect(classifyInternalProbeIdentity("user_2abcRealClerkId")).toEqual({
      isProbe: false,
    });
  });

  it("logs INTERNAL_PROBE_REMOTE_CALL_SKIPPED without a user id", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(
      skipClerkRemoteForInternalProbe({
        userId: "n07_user_a_deadbeef",
        route: "durable-domain",
        operation: "clearHeavyClerkKeys",
      }),
    ).toBe(true);
    expect(
      skipClerkRemoteForInternalProbe({
        userId: "user_2abcRealClerkId",
        route: "durable-domain",
        operation: "clearHeavyClerkKeys",
      }),
    ).toBe(false);
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).toContain("INTERNAL_PROBE_REMOTE_CALL_SKIPPED");
    expect(serialized).toContain("n07_soft_success_probe");
    expect(serialized).not.toContain("n07_user_a_deadbeef");
    info.mockRestore();
  });
});
