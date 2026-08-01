import { describe, expect, it } from "vitest";

import { CORE_USE_CASES, DIFFERENTIATION_CORES } from "@/lib/value-audit/use-cases";
import { productionReadyCount } from "@/lib/value-audit/feature-inventory";
import { runValueAuditSuite } from "@/lib/value-audit/run-suite";
import { pricingSummary } from "@/lib/value-audit/pricing-economics";

describe("value audit phase5", () => {
  it(
    "runs Phase5 value audit (honest FAIL without production E2E)",
    async () => {
      const suite = await runValueAuditSuite();

      expect(CORE_USE_CASES.length).toBeGreaterThan(0);
      expect(CORE_USE_CASES.length).toBeLessThanOrEqual(10);
      expect(DIFFERENTIATION_CORES.length).toBeLessThanOrEqual(3);
      expect(productionReadyCount()).toBe(0);
      expect(suite.demos.flows).toHaveLength(3);
      expect(suite.demos.flows.every((f) => f.ok)).toBe(true);
      expect(suite.phase5Pass).toBe(false);
      expect(suite.publishValueYes).toBe(false);

      const pricing = pricingSummary();
      expect(pricing.priceJpy).toBe(980);
      expect(pricing.personas[1]!.grossMarginJpy).toBeGreaterThan(0);

      console.log(
        JSON.stringify({
          suiteId: suite.suiteId,
          reportPath: suite.reportPath,
          phase5Pass: suite.phase5Pass,
          publishValueYes: suite.publishValueYes,
          localDemos: suite.demos.flows.map((f) => ({
            id: f.id,
            ok: f.ok,
            ms: f.durationMs,
            requestId: f.requestId,
          })),
        })
      );
    },
    300_000
  );
});
