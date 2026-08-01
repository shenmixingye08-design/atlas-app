import { describe, expect, it, beforeEach } from "vitest";

import { auditPastPhases, buildReleaseFindings } from "./evidence-audit";
import { decidePublishScope, gaCapabilities } from "./publish-scope";
import {
  resetCapabilityFlagsForTests,
  isCapabilityAllowedForUser,
  getCapabilityFlagState,
} from "./capability-flags";
import {
  resetKillSwitchesForTests,
  setKillSwitch,
  enforceKillSwitchesForRoute,
} from "./kill-switch";
import { runReleaseGateSuite } from "./run-suite";
import { RELEASE_GATE_RUNBOOKS } from "./runbooks";
import { RELEASE_GATE_ALERTS } from "./monitoring";

describe("release gate phase7", () => {
  beforeEach(() => {
    resetKillSwitchesForTests();
    resetCapabilityFlagsForTests();
  });

  it("marks all past phases honestPass=false without production proof", () => {
    const phases = auditPastPhases();
    expect(phases.length).toBe(6);
    expect(phases.every((p) => p.honestPass === false)).toBe(true);
  });

  it("keeps Critical open and no GA capabilities", () => {
    const findings = buildReleaseFindings(auditPastPhases());
    const openCritical = findings.filter(
      (f) => f.severity === "Critical" && f.status === "open"
    );
    expect(openCritical.length).toBeGreaterThanOrEqual(1);
    expect(gaCapabilities().length).toBe(0);
    expect(decidePublishScope().find((d) => d.id === "vision")?.scope).toBe(
      "一時停止"
    );
  });

  it("defaults vision capability to off and blocks non-owners", () => {
    expect(getCapabilityFlagState("vision")).toBe("off");
    expect(
      isCapabilityAllowedForUser({
        id: "vision",
        isOwner: false,
        isBetaUser: true,
      })
    ).toBe(false);
    expect(
      isCapabilityAllowedForUser({
        id: "vision",
        isOwner: true,
        isBetaUser: false,
      })
    ).toBe(true);
  });

  it("engages kill switch and returns 503", async () => {
    setKillSwitch({
      id: "x_post",
      engaged: true,
      reason: "test",
      actor: "vitest",
    });
    const res = enforceKillSwitchesForRoute("x");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });

  it("has runbooks and alerts catalog", () => {
    expect(RELEASE_GATE_RUNBOOKS.length).toBeGreaterThanOrEqual(20);
    expect(RELEASE_GATE_ALERTS.length).toBeGreaterThanOrEqual(10);
  });

  it(
    "runs Phase7 suite and concludes Release Ready NO",
    async () => {
      const suite = await runReleaseGateSuite();
      expect(suite.releaseReady).toBe(false);
      expect(suite.latest.criticalOpen).toBeGreaterThanOrEqual(1);
      expect(suite.latest.gaCount).toBe(0);
      expect(suite.latest.fullProductionRestoreProven).toBe(false);
      console.log(
        JSON.stringify({
          suiteId: suite.suiteId,
          reportPath: suite.reportPath,
          releaseReady: suite.releaseReady,
          criticalOpen: suite.latest.criticalOpen,
        })
      );
    },
    120_000
  );
});
