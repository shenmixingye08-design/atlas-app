/**
 * Vision Phase1 suite.
 * Live OpenAI only when OPENAI_API_KEY + QUALITY_LIVE_VISION=1 + ATLAS_MOCK_LLM!=true.
 * Never mocks success.
 */
import { describe, expect, it } from "vitest";

import { inspectVisionEvalEnv } from "@/lib/vision-eval/env-check";
import { runVisionPhase1Suite } from "@/lib/vision-eval/run-suite";

describe("vision phase1 suite", () => {
  it("runs 100-case harness and fails Phase1 when live API cannot execute", async () => {
    const env = inspectVisionEvalEnv();
    const suite = await runVisionPhase1Suite({
      limit: 100,
      generateArtifactsFor: env.canRunLocalLiveProvider ? 12 : 0,
    });

    expect(suite.results.length).toBe(100);
    expect(suite.faultResults.every((f) => f.pass)).toBe(true);
    expect(suite.results.every((r) => Boolean(r.requestId))).toBe(true);
    expect(suite.reportPath).toContain("PHASE1_REPORT.md");

    if (!env.canRunLocalLiveProvider) {
      expect(suite.aggregate.phase1Pass).toBe(false);
      expect(
        suite.results.every((r) => r.failureClass === "env_missing")
      ).toBe(true);
      expect(
        suite.aggregate.phase1FailReasons.some((r) =>
          /API未実行|OPENAI_API_KEY|live/i.test(r)
        )
      ).toBe(true);
    } else {
      // Live path: do not force PASS — assert measurement honesty only
      expect(
        suite.results.some((r) => r.failureClass === "env_missing")
      ).toBe(false);
      expect(suite.aggregate.totalCases).toBeGreaterThanOrEqual(100);
      console.log(
        JSON.stringify({
          phase1Pass: suite.aggregate.phase1Pass,
          visionSuccessRate: suite.aggregate.visionSuccessRate,
          ocrSuccessRate: suite.aggregate.ocrSuccessRate,
          p95Ms: suite.aggregate.p95Ms,
          reasons: suite.aggregate.phase1FailReasons,
          reportPath: suite.reportPath,
        })
      );
    }
  }, 1_800_000);
});
