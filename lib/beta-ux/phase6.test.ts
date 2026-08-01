import { describe, expect, it, beforeEach } from "vitest";

import {
  computeBetaMetrics,
  evaluateGateTargets,
} from "@/lib/beta-ux/metrics";
import { BETA_FLOWS } from "@/lib/beta-ux/protocol";
import {
  listBetaSessions,
  resetBetaUxStoreForTests,
  upsertBetaSession,
} from "@/lib/beta-ux/store";
import { runBetaUxSuite } from "@/lib/beta-ux/run-suite";

describe("beta ux phase6", () => {
  beforeEach(() => {
    resetBetaUxStoreForTests();
  });

  it("does not treat n<10 as definitive PASS", () => {
    for (let i = 0; i < 3; i++) {
      upsertBetaSession({
        sessionId: `s_${i}`,
        anonymousUserId: `u_${i}`,
        isBetaTester: true,
        personas: ["ai_beginner"],
        deviceType: "desktop",
        viewport: "1280x720",
        flowId: "A_word",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        completed: true,
        downloaded: true,
        stuckScreen: null,
        dropoutReason: null,
        requestId: `req_${i}`,
        jobId: null,
        artifactId: `art_${i}`,
        durationMs: 60_000,
        clickCount: 4,
        notes: null,
      });
    }
    const m = computeBetaMetrics(listBetaSessions(), []);
    expect(m.testerCount).toBe(3);
    expect(m.firstFlowComplete.definitive).toBe(false);
    expect(evaluateGateTargets(m).pass).toBe(false);
  });

  it(
    "runs Phase6 suite and FAILS without real users ≥10",
    async () => {
      expect(BETA_FLOWS.filter((f) => f.required).length).toBeGreaterThanOrEqual(
        5
      );
      const suite = await runBetaUxSuite();
      expect(suite.phase6Pass).toBe(false);
      expect(suite.generalReleaseRecommended).toBe(false);
      expect(suite.metrics.testerCount).toBeLessThan(10);
      console.log(
        JSON.stringify({
          suiteId: suite.suiteId,
          reportPath: suite.reportPath,
          phase6Pass: suite.phase6Pass,
          testerCount: suite.metrics.testerCount,
          failures: suite.gates.failures,
        })
      );
    },
    120_000
  );
});
