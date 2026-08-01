import { describe, expect, it } from "vitest";

import { runReleaseBlockerSuite } from "@/lib/release-blocker/run-suite";

const FULL = process.env.RELEASE_BLOCKER_FULL === "1";

describe("release blocker phase4", () => {
  it(
    FULL
      ? "runs full Phase4 Release Blocker Audit"
      : "smoke Phase4 (set RELEASE_BLOCKER_FULL=1 for full evidence write)",
    async () => {
      const suite = await runReleaseBlockerSuite();

      expect(suite.aggregate.permissionCases).toBeGreaterThanOrEqual(100);
      expect(suite.aggregate.permissionDeniedRate).toBe(1);
      expect(suite.aggregate.authzFixed).toBe(true);
      expect(suite.aggregate.billingGated).toBe(true);
      // Production secrets absent in agent → must remain Critical open
      expect(suite.aggregate.productionE2eVerified).toBe(false);
      expect(suite.aggregate.criticalOpen).toBeGreaterThanOrEqual(1);
      expect(suite.aggregate.releaseReady).toBe(false);

      const openCritical = suite.aggregate.findings.filter(
        (f) => f.severity === "Critical" && f.status === "open"
      );
      expect(openCritical.map((f) => f.id)).toContain(
        "production_e2e_unverified"
      );

      console.log(
        JSON.stringify({
          suiteId: suite.suiteId,
          reportPath: suite.reportPath,
          releaseReady: suite.aggregate.releaseReady,
          criticalOpen: suite.aggregate.criticalOpen,
          highOpen: suite.aggregate.highOpen,
          authzFixed: suite.aggregate.authzFixed,
          billingGated: suite.aggregate.billingGated,
          permissionDeniedRate: suite.aggregate.permissionDeniedRate,
          reasons: suite.aggregate.releaseReadyReasons,
        })
      );
    },
    FULL ? 600_000 : 300_000
  );
});
