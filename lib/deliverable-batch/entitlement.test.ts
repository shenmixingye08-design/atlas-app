import { describe, expect, it } from "vitest";

import { evaluateDeliverableBatchEntitlement } from "./entitlement";
import { isAllowedDeliverableBatchCount, resolveDeliverableBatchMaxItems } from "./config";

describe("deliverable batch entitlement", () => {
  it("allows only 3/5/7/10/12 and technical max 12", () => {
    expect([3, 5, 7, 10, 12].every(isAllowedDeliverableBatchCount)).toBe(true);
    expect(isAllowedDeliverableBatchCount(4)).toBe(false);
    expect(resolveDeliverableBatchMaxItems({} as unknown as NodeJS.ProcessEnv)).toBe(12);
    expect(
      resolveDeliverableBatchMaxItems({
        ATLAS_DELIVERABLE_BATCH_MAX_ITEMS: "20",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(12);
    expect(
      resolveDeliverableBatchMaxItems({
        ATLAS_DELIVERABLE_BATCH_MAX_ITEMS: "5",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(5);
  });

  it("rejects unknown formats and does not invent plan-specific batch caps", () => {
    const ok = evaluateDeliverableBatchEntitlement({
      userId: `batch-entitlement-${Date.now()}`,
      requestedCount: 3,
      format: "txt",
    });
    expect(ok.maxItems).toBe(12);
    const bad = evaluateDeliverableBatchEntitlement({
      userId: `batch-entitlement-${Date.now()}`,
      requestedCount: 3,
      format: "txt",
    });
    expect(bad.zipAllowed).toBe(true);
    expect(
      evaluateDeliverableBatchEntitlement({
        userId: "u",
        requestedCount: 4,
        format: "txt",
      }).allowed,
    ).toBe(false);
  });
});
