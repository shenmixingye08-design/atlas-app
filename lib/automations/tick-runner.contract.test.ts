import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("automation tick route contract", () => {
  it("uses the deadline-aware runner and does not raise maxDuration past 300", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/automations/tick/route.ts"),
      "utf8",
    );
    const runner = readFileSync(
      join(process.cwd(), "lib/automations/tick-runner.ts"),
      "utf8",
    );
    expect(route).toContain("runAutomationTick");
    expect(route).toMatch(/maxDuration = 300/);
    expect(runner).toContain("createTickBudget");
    expect(runner).toContain("TICK_IN_REQUEST_LIMITS");
    expect(runner).toContain("canStartJob");
    expect(runner).toContain("logAutomationTickSummary");
    const budget = readFileSync(
      join(process.cwd(), "lib/automations/tick-budget.ts"),
      "utf8",
    );
    expect(budget).toContain("AUTOMATION_TICK_SUMMARY");
    expect(runner).toContain("listTickSchemaErrors");
    expect(runner).toContain("deferredJobs");
  });
});
