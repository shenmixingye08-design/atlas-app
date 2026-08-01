import { describe, expect, it } from "vitest";

import { runArtifactDurabilitySuite } from "@/lib/artifact-durability/run-suite";

const FULL = process.env.ARTIFACT_DURABILITY_FULL === "1";

describe("artifact durability phase2", () => {
  it(
    FULL
      ? "runs full 400+ durability suite"
      : "smoke: 8 per format + 2 conversions (set ARTIFACT_DURABILITY_FULL=1 for full)",
    async () => {
      const suite = await runArtifactDurabilitySuite({
        perFormatLimit: FULL ? 100 : 8,
        conversionPerPair: FULL ? 20 : 2,
        revisionPerFormat: FULL ? 20 : 2,
      });

      expect(suite.results.length).toBeGreaterThanOrEqual(FULL ? 400 : 32);
      // Generators should mostly succeed locally
      const genRate =
        suite.results.filter((r) => r.okGenerate).length / suite.results.length;
      expect(genRate).toBeGreaterThan(0.8);

      // Production requirement honestly fails without secrets
      expect(suite.env.canRunProductionHttp).toBe(false);
      expect(suite.aggregate.phase2Pass).toBe(false);
      expect(
        suite.aggregate.phase2FailReasons.some((r) => /本番/.test(r))
      ).toBe(true);

      console.log(
        JSON.stringify({
          suiteId: suite.suiteId,
          reportPath: suite.reportPath,
          phase2Pass: suite.aggregate.phase2Pass,
          finals: Object.fromEntries(
            (["docx", "xlsx", "pdf", "pptx"] as const).map((f) => [
              f,
              {
                n: suite.aggregate.byFormat[f].total,
                final: suite.aggregate.byFormat[f].finalRate,
                structure: suite.aggregate.byFormat[f].structureRate,
                p95: suite.aggregate.byFormat[f].p95Ms,
              },
            ])
          ),
          conversion: suite.aggregate.conversion.rate,
          reasons: suite.aggregate.phase2FailReasons,
        })
      );
    },
    FULL ? 1_800_000 : 300_000
  );
});
